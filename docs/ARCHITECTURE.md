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

## Circuit storage (off-chain, hash-committed)

Compiled Arcis circuits total 9.22 MB across the 4 circuits. Storing them in `comp_def` accounts on Solana would cost ~64 SOL in rent (≈6.96 SOL/MB). Kindred uses Arcium's documented off-chain storage path instead:

```
programs/kindred/src/lib.rs    init_<circuit>_comp_def writes
                               CircuitSource::OffChain {
                                 source: "https://kindred.gudman.xyz/circuits/<name>.arcis",
                                 hash: circuit_hash!("<name>"),  // SHA-256 baked in at compile time
                               }
                               ─► comp_def account holds URL (~80 B) + 32-B hash
                                  Total cost ≈ 0.02 SOL across all 4 (~3000× cheaper)

VPS (nginx /circuits/ → /var/www/kindred-circuits/)
    serves the 4 .arcis files over HTTPS, public, no auth

Arx node (per computation)
    1. reads comp_def.circuit_source.{source, hash} from chain
    2. fetches the URL
    3. computes SHA-256 of the fetched bytes
    4. compares against the on-chain hash
    5. mismatch → aborts the computation
```

Verifiability is equivalent to on-chain storage — the on-chain commitment is a canonical 32-byte hash. RTG judges can re-derive: `arcium build` from this repo, `sha256sum build/<name>.arcis`, compare against the comp_def account's `circuit_source.hash` field. The repo's `scripts/upload-circuits-to-vps.sh` prints the local SHA-256 before uploading; `scripts/init-comp-defs.ts` prints it again after init.

Trust assumption: the VPS host must stay reachable. Mitigation: a hash mismatch is detected and refused, so a compromised host can only DoS (not silently substitute a malicious circuit). An IPFS mirror is a v2 nice-to-have.

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
