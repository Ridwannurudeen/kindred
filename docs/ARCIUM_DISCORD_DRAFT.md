# Arcium Discord — message draft (#dev-help or #rtg)

**Send from:** the user's main account.
**Goal:** confirm whether the 2 stale comp_def PDAs can be closed/re-initialized, or whether the right pattern is to bump `comp_def_offset` for fresh PDAs.

---

Hey Arcium team — quick question on stale comp_def cleanup. RTG submission ([Kindred](https://github.com/Ridwannurudeen/kindred) — federated MPC for cross-org genomic matching, deadline 2026-05-18).

**Setup**

- Anchor program `dxfUyyp55B2fAbgAVF491gRAvz2gqkvqKFMY9SDJH7B` on Solana devnet (Cerberus cluster 456 `DzaQCyfybroycrNqE5Gk7LhSbWD2qfCics6qptBFbr95`)
- Using `CircuitSource::OffChain` for all 4 circuits (init_org_registry, register_profile, intra_org_match, cross_org_match)
- VPS serves `.arcis` at `https://kindred.gudman.xyz/circuits/<name>.arcis` (SHA-256-pinned)

**The issue**

Earlier in the build I had `BUCKET_SIZE=8` and initialized comp_defs for `init_org_registry` and `register_profile`. After dropping to `BUCKET_SIZE=4` the `circuit_hash!(...)` output changed, but the on-chain comp_defs still carry the OLD hash:

- `BatcSDwYDGTdeAQmSwHCaBFKZPHQSfYw8XCKF8tpuZ4D` — init_org_registry (113 B, owner = Arcium program)
- `98S3XnrQbtH3aqGHf2rGQZwA41MFj43MknMcRJWs2G3e` — register_profile (131 B, owner = Arcium program)

Authority on both: `74CSjKvYyVdj4sgrpQGD2RBvcGyZSSNpfoTgsCJUB5oe` (same wallet still in control).

If I re-run `init_*_comp_def`, the Anchor `init` constraint trips on the existing PDA. With `init_if_needed` it'd skip and leave the OLD hash in place, which would fail the Arx-node integrity check at execution time.

**Questions**

1. Is there a public close-or-reinit instruction on the Arcium program for an authority-held comp_def?
2. If not, is the recommended pattern to bump `comp_def_offset` by renaming the circuit (e.g. `init_org_registry_v2`) and accept the ~3.4 mSOL stuck in the orphans?
3. Anything cleaner that I'm missing?

Happy to share `anchor inspect` output on either PDA if it helps. Thanks!
