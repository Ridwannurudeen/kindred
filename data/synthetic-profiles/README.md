# Kindred synthetic profiles — demo data

**These are synthetic, computer-generated CODIS STR profiles. No real DNA is anywhere in this repository.**

## What's here

`generate.ts` — deterministic profile generator with seeded Mendelian inheritance. Run with:

```bash
cd data/synthetic-profiles
node ../../node_modules/ts-node/dist/bin.js \
  --transpile-only \
  --compiler-options '{"lib":["es2020"],"target":"es2020","types":["node"]}' \
  generate.ts
# Outputs:
#   profiles.json       — all 25 profiles + free-text relationship summary
#   relationships.json  — structured ground truth (positives + negatives, IBS ranges, computed values)
#   csv/<id>.csv        — per-profile CODIS-format CSV (locus, allele1, allele2)
```

## Demo registry

5 orgs × 5 profiles = 25 total. Seed: `kindred-demo-v1`.

| Org | Members | Relationships |
|---|---|---|
| **Oregon Adoption Registry (OAR)** | OAR-001 (Maya), OAR-002–005 | Maya: adoptee searching for bio mother → TAR-002 |
| **Texas Adoption Registry (TAR)** | TAR-001, TAR-002 (Maya's bio mother), TAR-003–005 | Cross-org parent–child match with Maya |
| **Donor-Conceived Network (DCN)** | DCN-001 (Aiden), DCN-002–005 | DCN-001 ↔ DCN-004: half-siblings (shared donor) |
| **UNHCR Family Tracing** | UNHCR-001 (Noor), UNHCR-002–005 | Noor: no match (true-negative demo) |
| **Diaspora Heritage Foundation (DHF)** | DHF-001 (Ren), DHF-002–005 | DHF-001 ↔ DHF-003: avuncular (uncle-nephew) |

## Expected IBS scores (when run through the Kindred MXE)

Per-locus IBS contribution is `{0, 1, 2}` for `{no shared alleles, one shared allele, full genotype match}`. Sum across 20 loci → 0–40.

| Pair | Computed (this seed) | Expected range | Interpretation |
|---|---|---|---|
| OAR-001 ↔ TAR-002 | **21** | 20–26 | Parent-child — ≥20 by inheritance, +random allele coincidence at 1 locus |
| DCN-001 ↔ DCN-004 | **15** | 12–20 | Half-siblings (shared donor #7421) |
| DHF-001 ↔ DHF-003 | **13** | 12–20 | Avuncular — uncle-nephew, kinship coefficient 0.125 |
| UNHCR-001 ↔ UNHCR-002 | **1** | 0–14 | Unrelated — true-negative for Noor's search |
| OAR-001 ↔ OAR-002 | **8** | 0–14 | Unrelated intra-org noise floor |
| OAR-001 ↔ TAR-001 | **6** | 0–14 | Unrelated cross-org (federation w/ no match) |

> Note on parent-child: the textbook "exactly 20" is idealized. In practice the non-inherited child allele can coincidentally match the parent's other allele at some loci, pushing per-locus contribution from 1 to 2. With 20 loci and limited per-locus allele counts (e.g. TH01 has only 11 distinct alleles), an IBS of 20–26 is the realistic envelope.

Full ground-truth pair matrix lives in `relationships.json` and is consumed by `tests/kinship.test.ts`. The generator prints actual vs expected IBS to stderr on each run and flags any pair outside its expected range.

## CODIS panel used

20 expanded CODIS loci (effective Jan 2017+):

D3S1358, vWA, FGA, D8S1179, D21S11, D18S51, D5S818, D13S317, D7S820, D16S539, TH01, TPOX, CSF1PO, D1S1656, D2S441, D2S1338, D10S1248, D12S391, D19S433, D22S1045

Each locus value = integer count of tandem repeats (typical range 4–40 depending on locus).

## Why synthetic, not real

Real DNA carries enormous personal and familial liability. Kindred's threat model and target users (adoptees, donor-conceived, refugees, diaspora) make demo-with-real-DNA actively harmful. Synthetic Mendelian-inherited profiles let us prove the cryptography and matching algorithm work without ever touching real biological data. Production deployments would integrate with accredited HLA/STR typing labs.
