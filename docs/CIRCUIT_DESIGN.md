# CIRCUIT_DESIGN.md — Kindred Arcis circuits

## Overview

Kindred's Arcis circuit module (`encrypted-ixs/src/lib.rs`) defines four circuits:

| Circuit | Purpose | Inputs | Output |
|---|---|---|---|
| `init_org_registry` | Bootstrap empty bucket for new org | (none) | `Enc<Mxe, ProfileBucket>` |
| `register_profile` | Add a profile to an org's bucket | `Enc<Shared, StrProfile>`, `Enc<Mxe, ProfileBucket>` | `Enc<Mxe, ProfileBucket>` |
| `intra_org_match` | Match two members of same org | `u8`, `u8`, `Enc<Mxe, ProfileBucket>` | `u8` (public IBS score) |
| `cross_org_match` | Match member of org A with member of org B | `u8`, `u8`, `Enc<Mxe, ProfileBucket>` × 2 | `u8` (public IBS score) |

The `cross_org_match` is the **federation primitive** — it operates over two encrypted bucket states from different organizations, performing joint computation without joint data access.

## Constants

```
NUM_LOCI            = 20      // Expanded CODIS panel (effective Jan 2017)
ALLELES_PER_LOCUS   = 2       // Diploid: every locus has two allele values
PROFILE_LEN         = 40      // 20 loci × 2 alleles
BUCKET_SIZE         = 8       // Profiles per org bucket (v1 demo capacity)
```

## Data shapes

```rust
pub struct StrProfile {
    pub alleles: [u8; 40],
}

pub struct ProfileBucket {
    pub profiles: [StrProfile; 8],
    pub count: u8,
}
```

`u8` per allele is appropriate: real CODIS allele integers (tandem repeat counts) range roughly 4–40 across the 20 loci.

## IBS scoring (Identity-by-State)

For each locus, both individuals have an unordered pair of alleles `{a1, a2}` and `{b1, b2}`. Locus IBS is 0, 1, or 2:

| Case | Per-locus IBS |
|---|---|
| Both alleles match | 2 |
| Exactly one allele in common | 1 |
| No allele in common | 0 |

Total IBS = sum of locus IBS over 20 loci, range 0–40.

### Branchless implementation

```rust
fn ibs_locus(a1: u8, a2: u8, b1: u8, b2: u8) -> u8 {
    let any_share  = ((a1 == b1) || (a1 == b2) || (a2 == b1) || (a2 == b2)) as u8;
    let geno_match = (((a1 == b1) && (a2 == b2)) || ((a1 == b2) && (a2 == b1))) as u8;
    any_share + geno_match
}
```

Why branchless: in MPC both `if/else` branches always execute. Conditional logic via boolean AND/OR/multiplication keeps execution time independent of allele values, which is essential for hiding which positions matched.

### Hand-traced cases (correctness proof)

| A genotype | B genotype | any_share | geno_match | IBS | Expected |
|---|---|---|---|---|---|
| {12, 14} | {12, 14} | 1 | 1 | **2** | identical → 2 ✓ |
| {12, 12} | {12, 14} | 1 | 0 | **1** | shares 12 only → 1 ✓ |
| {12, 12} | {13, 14} | 0 | 0 | **0** | disjoint → 0 ✓ |
| {12, 12} | {12, 12} | 1 | 1 | **2** | both homozygous, same → 2 ✓ |
| {12, 14} | {14, 12} | 1 | 1 | **2** | unordered same genotype → 2 ✓ |
| {12, 14} | {14, 15} | 1 | 0 | **1** | shares 14 only → 1 ✓ |
| {12, 14} | {12, 15} | 1 | 0 | **1** | shares 12 only → 1 ✓ |
| {12, 14} | {15, 16} | 0 | 0 | **0** | disjoint → 0 ✓ |

## Expected total IBS by relationship

Derived from Mendelian inheritance probabilities:

| Relationship | Expected IBS | Variance |
|---|---|---|
| Identical / duplicate | 40 | 0 |
| Parent-child | **exactly 20 minimum** (≥1 per locus by inheritance), typical 20–22 | low |
| Full sibling | ~25 | moderate |
| Half-sibling / avuncular / first cousin / grandparent | ~15 | high |
| Unrelated | ~10 | high |

Rationale: at each locus, full siblings share 0/1/2 alleles with probability 1/4, 1/2, 1/4 respectively → expected per-locus IBS = 0×0.25 + 1×0.5 + 2×0.25 = 1.25, so 20 loci × 1.25 ≈ 25. Half-siblings share 1 allele 50% of the time from the shared parent + baseline accidental matching → ~0.75/locus → ~15 over 20 loci.

## Constant-time array indexing

Per Arcis docs, array indexing with a non-constant index is O(N) — all positions are scanned to hide which index was accessed. We rely on this for `register_profile` (constant-time slot insertion) and the match circuits (which fetch profile by `a_idx`/`b_idx` from the encrypted bucket).

The slot-insertion pattern for `register_profile`:

```rust
for i in 0..BUCKET_SIZE {
    let is_target = (i as u8) == bucket.count;
    for j in 0..PROFILE_LEN {
        // Constant-time conditional copy via multiplexing
        bucket.profiles[i].alleles[j] = if is_target { new_val } else { old_val };
    }
}
```

The `if is_target { new_val } else { old_val }` is compiled to a constant-time select, not a branch.

## Honest limitations of 20 STRs

- 20 STR loci reliably distinguish **parent-child and full siblings** from unrelated.
- Beyond 2nd-degree relatives (half-sib, avuncular, first cousin), variance dominates and IBS scores overlap with the unrelated distribution.
- Modern consumer relative-finders (23andMe, AncestryDNA) use SNP arrays with 600K+ markers — orders of magnitude more discriminating power.
- For Kindred v1, we explicitly limit claims to "first-degree relative detection" and frame v2 as "scales to SNP-array matching when Arcium circuit limits expand."

## Compute cost (measured, 2026-05-07)

From `arcium build` output (Arcium 0.9.7):

| Circuit | ACUs |
|---|---|
| init_org_registry | 1.54 B |
| register_profile | 3.68 B |
| intra_org_match | 1.77 B |
| cross_org_match | 3.35 B |

`cross_org_match` is the federation primitive and uses about 2× the ACUs of intra-match (operates over 2 buckets instead of 1). Total budget across the system is well within Arcium's per-callback 1232-byte output limit (our outputs are `u8` or single `Enc<Mxe, ProfileBucket>` ciphertexts — none come close to the cap).
