# THREAT_MODEL.md — Kindred

What Kindred protects, what it does not, and how a knowledgeable adversary should reason about it.

## Goals

1. **No party — including Kindred operators, Arcium validators, organization admins, or chain-state observers — can reconstruct any user's genome.**
2. **No organization can read another organization's member roster, even when federated.**
3. **A kinship score is revealed only after both participating users explicitly consent.**
4. **All claims are cryptographically and architecturally enforced — not policy-enforced.**

## Trust model

| Entity | Trust assumption | What they can do | What they cannot do |
|---|---|---|---|
| User | Untrusted | Submit encrypted profile, request matches, consent/reject | See others' profiles or non-consented scores |
| Org admin | Semi-trusted (curator of their own org) | Register/deactivate members for their own org | See other orgs' member rosters or any profile contents |
| Arcium validator (Arx node) | Honest-but-curious (Cerberus protocol assumption) | Participate in MPC computation | Reconstruct inputs alone or in collusion below threshold |
| Kindred protocol admin | Trusted to bootstrap (one-time) | Deploy program, init compute definitions | Read encrypted state |
| Chain observer | Untrusted | Read all on-chain accounts | Decrypt any `Enc<Mxe, T>` ciphertext |

## What Kindred protects

### A. Profile confidentiality
- Profiles are encrypted client-side via x25519 ECDH + Rescue cipher before submission.
- On-chain state stores `Enc<Mxe, ProfileBucket>` ciphertexts. The decryption key is collectively held by the MPC cluster — no single Arx node can decrypt.
- Profiles are **never decrypted** outside MPC-secret-shared form. Even during computation, no Arx node sees the plaintext.

### B. Cross-organizational data sovereignty
- Each org owns its own `OrgBucket` PDA. Org A admins cannot read Org B's bucket.
- The `cross_org_match` MXE circuit takes both orgs' encrypted buckets as inputs, but neither org's plaintext bucket exists outside MPC-secret-shared form.
- After computation, only the IBS score is revealed (and only to the consenting users).

### C. Score confidentiality
- A match request creates a `MatchRequest` PDA in `Pending` state.
- The MXE computation only runs when both users sign consent.
- The kinship score (a single `u8`) is then revealed publicly — but only one number, and only after explicit mutual consent.

### D. Forward secrecy (partial)
- Each match uses a fresh x25519 ephemeral keypair on the client side. Compromise of one session's key does not affect others.

## What Kindred does NOT protect (v1 disclosed limitations)

### 1. Wallet linkability
- The Solana wallet that registers a profile is publicly observable on-chain.
- An observer who knows a user's wallet can determine which org they registered with and when.
- **Mitigation v2:** stealth addresses for member registration.

### 2. Slot indices public
- The Profile PDA seed includes a slot index, so an observer can count members per org and tell which user occupies which slot.
- This leaks org membership counts and member ordering, but not profile contents.

### 3. Org admin trust
- v1 uses a single keypair per org admin. A compromised admin can:
  - Register adversarial profiles into their own bucket (NOT others')
  - Deactivate legitimate members
  - Sign federation agreements with malicious orgs
- **Mitigation v2:** multi-sig org admin authority + KYB onboarding for orgs.

### 4. Adversarial profile pre-commit attack
- A malicious org could seed dummy profiles designed to maximize IBS overlap with target genomes (e.g., profiles with all-common alleles, or profiles crafted to score-bomb specific user IDs).
- **Mitigation v2:** profile attestation — an accredited STR typing lab signs a hash of the user's profile, and registration requires a valid lab signature. Non-attested profiles are flagged or excluded from cross-org matching.

### 5. Match request graph leakage
- Public `MatchRequest` PDAs leak which user requested a match with which other user, even before consent.
- Observers can infer relationship-search patterns.
- **Mitigation v2:** confidential request submission via separate MXE call, surfacing only after consent.

### 6. Side channels on Arx nodes
- Timing, memory access patterns, or power analysis on individual Arx nodes could leak information if a single node is compromised.
- The Cerberus MPC protocol assumes dishonest-majority-resistant behavior, but extreme side-channel attacks are out of scope of the cryptographic protocol.
- **Mitigation v2:** MXE-level configuration choices (cluster topology, node hardware attestation).

### 7. Genome inference from kinship scores
- A user who repeatedly matches against many strangers can statistically infer which alleles are common in the population — small information leak, not exploitable to reconstruct any specific genome.
- **Mitigation v2:** rate-limit match requests per user.

### 8. Consent revocation post-reveal
- Once a score is revealed, the consenting users have learned it. There is no cryptographic way to "un-reveal" the number.
- This is by design — kinship discovery is the entire purpose of the system.

### 9. Synthetic-only profiles in v1
- v1 demo uses synthetic profiles. There is no real-DNA threat model in v1 because there is no real DNA.
- **Production v2 considerations:** chain of custody from accredited lab to user device, secure deletion of transient plaintext during encryption, attestation of typing equipment.

## Threat model for the demo

The v1 demo deploys to Solana devnet with synthetic data. The active threat model:
- ✅ All cryptographic guarantees from the protocol are real and verifiable.
- ❌ The "production" threats around real-DNA handling, chain-of-custody, and adversarial orgs are explicitly out of scope and disclosed in the writeup.

Judges and reviewers are encouraged to:
1. Verify on-chain MXE callback signatures via Solana Explorer
2. Inspect ciphertext bytes — they are uniformly random (no patterns leak)
3. Run two browser sessions against the same devnet program to verify the consent gate
4. Read this document and the BLOG_POST manifesto for the architectural justification

The strongest claim Kindred makes: **the system is the first MPC-native primitive for cross-organizational genomic matching**, and the federation guarantee — neither org sees the other's data — is architecturally enforced, not policy-promised.

## Build-time advisories (not vulnerabilities)

### Stack-frame warning on `arcium_client::idl::arcium::utils::Account::try_from`

When `arcium build` runs against the Arcium 0.9.7 dependency stack, the SBF compiler emits one warning of the form:

```
Stack offset of 865512 exceeded max offset of 4096 by 861416 bytes,
please minimize large stack variables.
```

referencing the auto-generated function `arcium_client::idl::arcium::utils::Account::try_from`.

This is **not a Kindred bug** and **not exploitable**. Origin and disposition:

- The function is auto-generated by Anchor 0.32's `declare_program!(arcium)` macro inside `arcium-client::idl`. The macro expands to an `enum Account { MXEAccount(MXEAccount), ComputationDefinitionAccount(ComputationDefinitionAccount), … }` with one variant per Arcium account.
- Rust enum size = max-variant-size; Arcium 0.9.x accounts contain 5×32-byte rescue keys plus MPC node configurations, which inflates the enum to ~865 KB. The auto-generated `TryFrom<&[u8]>` impl needs a stack frame of that size to deserialize the largest variant in-place.
- Arcium 0.8.0 does not produce this warning (smaller account types). The regression was introduced by IDL/account growth in 0.9.x.
- Kindred **does not call** `Account::try_from` anywhere. Account validation in our instruction handlers uses Anchor's standard `Account<'info, T>` wrapper (per-type `try_deserialize_unchecked`), never the discriminated enum.
- With `lto = "fat"` and `codegen-units = 1` (configured in workspace `Cargo.toml`), link-time dead-code elimination removes unreachable pub items. The shipped `target/deploy/kindred.so` is 760 KB with .text = 664 KB — within Solana's normal envelope.
- The Solana SBF VM only enforces stack-frame limits at function entry, not program load. Since this function is never invoked, the "may cause undefined behavior during execution" caveat does not apply at runtime.

The warning persists until upstream `arcium-client` feature-gates the `declare_program!` macro behind a non-SBF `client` feature, or boxes each enum variant.
