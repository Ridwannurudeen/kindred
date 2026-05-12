# ARCHITECTURE.md — Kindred

## System layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser (React + Vite)                                               │
│  - x25519 ECDH key generation                                        │
│  - Rescue cipher session                                             │
│  - CODIS CSV parser                                                  │
│  - Wallet adapter (Phantom, Solflare, Backpack)                      │
└──────────────────────────────────────────────────────────────────────┘
              │ encrypted profile (ciphertext + nonce + pubkey)
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Solana program: kindred (Anchor 0.32.1 + arcium-anchor 0.9.7)       │
│                                                                       │
│  Account types:                                                       │
│   - Protocol  (singleton: cluster + comp_def offsets + admin)        │
│   - Org       (per-org: admin authority, name, member count)         │
│   - OrgBucket (per-org: encrypted ProfileBucket ciphertext + nonce)  │
│   - Profile   (per-(org, user): slot, opt-in flags)                  │
│   - FederationAgreement (per-(org_a, org_b) pair: active, expires)   │
│   - MatchRequest (per-(a, b) pair: state machine, score on reveal)   │
│                                                                       │
│  Instructions:                                                        │
│   - init_*_comp_def × 4 (one per circuit)                            │
│   - create_org → queues init_org_registry MXE call                   │
│   - set_federation_agreement (two-sig: A proposes, B accepts)        │
│   - register_profile → queues register_profile MXE                   │
│   - request_intra_match / request_cross_match                        │
│   - consent_match → queues intra_org_match OR cross_org_match MXE    │
│   - reject_match / expire_match                                      │
│                                                                       │
│  Callbacks (signed-output verification via verify_output()):          │
│   - init_org_registry_callback → writes encrypted bucket             │
│   - register_profile_callback → updates bucket + creates Profile     │
│   - intra_org_match_callback → reveals score, MatchRevealedEvent     │
│   - cross_org_match_callback → reveals score, MatchRevealedEvent     │
└──────────────────────────────────────────────────────────────────────┘
              │ queue_computation CPI to Arcium program
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Arcium MXE (Cerberus protocol, multi-Arx-node cluster)               │
│                                                                       │
│  Circuits (encrypted-ixs/src/lib.rs):                                │
│   - init_org_registry  → Enc<Mxe, ProfileBucket>  (1.54B ACUs)       │
│   - register_profile   → Enc<Mxe, ProfileBucket>  (3.68B ACUs)       │
│   - intra_org_match    → u8 (public, after both consent)  (1.77B)    │
│   - cross_org_match    → u8 (public, after both consent)  (3.35B)    │
│                                                                       │
│  Profiles never reconstructed in plaintext outside MPC-secret-shared │
│  form. Score is the only public output, only after consent.          │
└──────────────────────────────────────────────────────────────────────┘
```

## Match flow (cross-organizational, the federation case)

```
Time     User A (Maya, OAR)              Solana program           User B (Maya's bio mother, TAR)         MXE
────────────────────────────────────────────────────────────────────────────────────────────────────────
t0      register profile      ─►    register_profile_callback
        (encrypted)                  → OAR bucket updated
                                     → Profile (OAR, A) created
                                                                  register profile        ─►   register_profile_callback
                                                                  (encrypted)                  → TAR bucket updated
                                                                                                → Profile (TAR, B) created
─────────────────────────────────────────── (off-chain: A and B independently registered) ────────────────────────────
t1      browse federated orgs       (reads on-chain orgs + agreements)
        (sees TAR has 5 members)
        request_cross_match
        target=(TAR, slot 1)   ─►   MatchRequest(A, B) Pending
                                    emit MatchRequestedEvent
                                                                  inbox: pending request from A
                                                                  consent_match           ─►   MatchRequest(A, B) Consented
                                                                                               queue_computation cross_org_match
                                                                                                    Args:
                                                                                                      a_idx (slot of A in OAR)
                                                                                                      b_idx (slot of B in TAR)
                                                                                                      OAR bucket (encrypted)
                                                                                                      TAR bucket (encrypted)
                                                                                                                                    ─►  cross_org_match
                                                                                                                                        runs over both
                                                                                                                                        encrypted buckets
                                                                                                                                        without reconstructing
                                                                                                                                        either plaintext
                                                                                                ◄─                                       SignedComputationOutputs(score=20)
                                                                                               cross_org_match_callback
                                                                                                 verify_output()
                                                                                                 MatchRequest.score = 20
                                                                                                 MatchRequest.state = Revealed
                                                                                                 emit MatchRevealedEvent {a, b, score=20, is_cross_org=true}
        view reveal screen     ◄─   reads MatchRequest             ◄─    reads MatchRequest
        score: 20
        interpretation:
        "Parent-child"
```

The MXE never sees the buckets in plaintext. Each Arx node holds a secret share of each bucket. The IBS computation runs across the secret-shared state, and only the reconstructed final score (a single u8) becomes public after the callback.

## Federation agreement lifecycle

```
[None] ─── create_org(A) ────────────► OrgA exists, bucket initialized via MXE
       └── create_org(B) ────────────► OrgB exists, bucket initialized via MXE

OrgA admin + OrgB admin
       ─── set_federation_agreement(A, B) (two-sig tx) ────► FederationAgreement(A, B) active

Members of A or B
       ─── opt_in_cross_match flag set on Profile ─────► eligible for cross-org matching
       ─── request_cross_match(target_org, target_idx) ───► requires FederationAgreement to exist

revoke_federation(A, B) ─────► FederationAgreement archived
                                In-flight requests honored
                                New cross-org requests rejected
```

## Match consent state machine

```
                 request_*_match
[None] ─────────────────────────────► Pending
                                          │
                            ┌─────────────┼──────────────┐
                            │             │              │
                consent_match  reject_match  expire_match (24h)
                            │             │              │
                            ▼             ▼              ▼
                      Consented        Rejected      Expired
                            │
                            │ (Anchor program queues MXE call)
                            ▼
                       Computing
                            │
                            │ (MXE callback verify_output)
                            ▼
                        Revealed
                            │
                            └─ score (u8) public, both users notified
```

## Why MPC, not TEE or ZKP

| Architecture | Failure mode |
|---|---|
| Centralized intermediary | Single party sees both orgs' data — same as 23andMe pre-breach |
| TEE federation | One org's enclave compromise leaks all federated orgs' data |
| ZKP | Proves statements about own data, no joint-input compute primitive |
| **MPC (Arcium)** | **Joint computation without joint data access — the only primitive that works for cross-organizational matching** |

This is the load-bearing technical claim of the project.
