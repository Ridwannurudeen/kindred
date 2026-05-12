# Kindred — project guide

**Federated MPC infrastructure for genomic matching** on Solana + Arcium.
RTG track: https://rtg.arcium.com/rtg/dev-dna-matching
Submission target: 2026-05-18.

## Load-bearing claim

Cross-organizational genomic matching is architecturally impossible without MPC:
- Centralized intermediary fails (23andMe-style breach)
- TEE federation fails on single-org enclave compromise
- ZKP fails (no joint-input compute primitive)
- MPC (Arcium MXE) is the only primitive where joint computation happens without joint data access

The end users are populations who cannot safely use centralized DNA services: adoptees in sealed-records states, donor-conceived people, refugees, diaspora communities under hostile-state surveillance, communities harmed by historical genetic exploitation.

## Toolchain (run inside WSL Ubuntu)

```bash
# Required PATH set:
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 22

# Versions (verified 2026-05-07):
arcium 0.9.7
arcup 0.9.7
solana-cli 2.3.0
anchor-cli 0.32.1 (prebuilt binary)
rustc 1.95.0 (project pins 1.89.0 via rust-toolchain.toml)
node 22.22.2, yarn 1.22.22
docker 29.0.0
```

## Build / test / deploy

```bash
arcium build             # compiles Anchor program + Arcis circuits
arcium test              # spins localnet (2-node Cerberus cluster), runs ts-mocha
arcium test --cluster devnet
arcium deploy --cluster-offset <N>
```

## Project layout

```
kindred/
├── Anchor.toml                # programs.localnet kindred = "<program-id>"
├── Arcium.toml                # [localnet] 2 nodes, [clusters.devnet] commented
├── Cargo.toml                 # workspace: programs/*, encrypted-ixs
├── package.json               # @arcium-hq/client 0.9.7, @coral-xyz/anchor ^0.32.1
├── rust-toolchain.toml        # 1.89.0 (pinned)
├── programs/kindred/
│   └── src/lib.rs             # Anchor program (current: hello-world add_together)
├── encrypted-ixs/
│   └── src/lib.rs             # Arcis circuits (current: hello-world add_together)
├── app/                       # frontend (to bootstrap with Vite + React + TS)
├── tests/kindred.ts           # ts-mocha integration test (canonical pattern)
├── migrations/deploy.ts
└── target/                    # build output
```

## Phase plan (9 days from 2026-05-07)

- **Phase 1 (Day 1–2):** ✅ Bootstrap done. Verify `arcium build` passes on hello-world.
- **Phase 2 (Day 2–3):** Replace hello-world with 4 Arcis circuits (init_org_registry, register_profile, intra_org_match, cross_org_match).
- **Phase 3 (Day 3–5):** Replace Anchor program with 6 accounts (Protocol, Org, OrgBucket, Profile, FederationAgreement, MatchRequest), 14 instructions, 4 callbacks.
- **Phase 4 (Day 5–7):** Frontend (Vite + React) — Landing, Onboarding, Browse (split intra/federated), Request, Inbox, Reveal, Federation graph, Org admin stub.
- **Phase 5 (Day 7):** Synthetic data — 5 orgs × 5 profiles, Mendelian-seeded relationships, federation agreements.
- **Phase 6 (Day 8):** Tests, docs (CIRCUIT_DESIGN.md, THREAT_MODEL.md, ARCHITECTURE.md, AI_USAGE.md), polish.
- **Phase 7 (Day 9):** Deploy + submission kit (90s video, blog post, X thread, RTG form).

Full plan: `~/.claude/projects/C--Windows-System32/memory/kindred-arcium-rtg.md`

## Identity policy

No Claude/Anthropic attribution in commits, code, or PRs. No Co-Authored-By. Per global CLAUDE.md.

## Demo personas + orgs (from §7 of full plan)

| Persona | Org | Match | Mode | Expected IBS |
|---|---|---|---|---|
| Maya — adoptee | Oregon Adoption Registry | Profile #102, Texas Adoption Registry | **CROSS-ORG** ⭐ | 20 (parent–child) |
| Aiden — donor-conceived | Donor-Conceived Network | Profile #204, same org | intra | ≈15 (half-sib via shared donor) |
| Noor — refugee | UNHCR Family Tracing | (no match) | intra | ≈10 (true negative) |
| Ren — diaspora | Diaspora Heritage Foundation | Profile #408, same org | intra | ≈15 (avuncular) |

## Score interpretation

- 38–40: Identical / duplicate sample
- 22+: First-degree relative likely (parent–child IBS = 20 strict; full sib mean ≈ 25)
- 13–21: Second-degree (half-sib, avuncular, grandparent) or weak first-degree
- 0–12: No detectable kinship

## What stays encrypted

Profiles never decrypted outside MPC-secret-shared form. Only public outputs:
- Bucket counts per org (number of registered members)
- Federation agreements (which orgs are federated)
- Match request lifecycle states
- Final IBS score (only after both parties consent)

## Threat model — known v1 limitations (disclose in writeup)

- Wallet linkability (which wallet registered in which org is publicly observable)
- Slot indices public (Profile PDA seed includes slot)
- Org admin trust model: v1 uses single keypairs; real deployment needs multisig + KYB
- Adversarial profile pre-commit (org could seed dummy profiles to score-bomb a target)
- All addressed in v2 via stealth addresses + profile attestation
