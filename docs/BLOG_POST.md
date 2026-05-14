# Kindred: Federated MPC Infrastructure for Genomic Matching

*How Arcium made cross-organizational DNA matching possible without any organization seeing the others' data.*

**[Live demo](https://kindred.gudman.xyz)** · **[90-second walkthrough](https://youtu.be/rBao3EV8PtI)**

---

## I. The institutional shape of the problem

Two adoption agencies, in two states, both holding genetic profiles of their members. Both bound by confidentiality statutes not to share that data with anyone — including each other.

An adoptee in one state may have a biological parent registered in the other. Today, no path exists to discover it. The data is real, the people are real, the desire to connect is real. But the architectures available to them all fail.

This is the institutional shape of a problem genomic matching has had for forty years: data exists in silos that are legally and ethically unmergeable. **Kindred is the first cryptographic primitive that lets those silos perform joint computation without joint data access.**

---

## II. The centralization failure

The history of consumer DNA databases is a sequence of escalating breaches.

In 1951, Henrietta Lacks's cancer cells were taken without her consent and used to build the HeLa cell line that has since been the basis of billions of dollars of biomedical research. Her family was not informed for over twenty years.

In April 2018, the Golden State Killer was arrested after a relative of his uploaded DNA to GEDmatch — a free public DNA database — and law enforcement found a familial match. The arrest was widely celebrated. It also established that *any* DNA upload, by any relative, exposes everyone in your genetic neighborhood to law-enforcement subpoena.

In October 2023, 23andMe disclosed a breach affecting **roughly 7 million users**. Attackers specifically targeted profiles flagged as Ashkenazi Jewish. The data sat on a centralized server because relative-matching required a centralized server to see both genomes.

The throughline: every centralized service is one breach, one subpoena, or one policy change from being a surveillance tool. The populations who most need genomic matching — adoptees, donor-conceived people, refugees, diaspora communities — are the ones for whom this risk is highest. They rationally opt out.

**Kindred is built for the populations who can't afford to be in 23andMe.**

---

## III. The federation problem

Real institutions hold this data and want to do good with it.

- **Adoption agencies** have member rosters of adoptees and biological parents who consented to limited contact. They have legal obligations under state confidentiality statutes that prevent inter-state federation.
- **Refugee tracing networks** like the ICRC's Restoring Family Links program help reunite families separated by war. They handle data from populations under hostile-state surveillance and cannot share rosters across jurisdictions.
- **Donor-conceived registries** hold genetic data of donors and offspring who have varying levels of opt-in. Cross-clinic federation has been a manual, lawyer-mediated process for decades.
- **Diaspora heritage organizations** preserve genealogical records of communities scattered by colonization, displacement, or persecution. Their members specifically chose them over commercial databases.

Each of these institutions is sovereign. Each has legal obligations not to share. Today they don't connect. The architectural question becomes: *can two institutions perform joint matching without either seeing the other's data?*

| Approach | Why it fails |
|---|---|
| Centralized intermediary | Same failure mode as 23andMe — single party sees both inputs |
| TEE federation | Single org's enclave compromise leaks all federated orgs' data |
| ZKP | Proves statements about own data; no joint-input compute primitive |
| **MPC** | **Joint computation without joint data access — the only primitive that works** |

This is the load-bearing technical claim of Kindred.

---

## IV. The Kindred protocol

Kindred is built on Solana and Arcium's MXE (Multi-Party eXecution Environment). The key components:

**Per-organization encrypted bucket.** Each org owns an `Enc<Mxe, ProfileBucket>` on Solana. Members register into their org's bucket via an Arcium MPC circuit. The bucket state is never decrypted except inside MPC-secret-shared form — meaning no single Arx node can reconstruct it, and the org admin cannot read its own bucket.

**Federation agreements.** Two orgs sign a public on-chain `FederationAgreement` PDA. Once signed, members of either org can opt in to cross-org matching.

**Cross-organizational matching.** When a member of Org A requests a match with a member of Org B, the Anchor program queues a `cross_org_match` MXE computation. The circuit takes both orgs' encrypted buckets as inputs:

```rust
#[instruction]
pub fn cross_org_match(
    a_idx: u8, b_idx: u8,
    registry_a: Enc<Mxe, ProfileBucket>,
    registry_b: Enc<Mxe, ProfileBucket>,
) -> u8 {
    let bucket_a = registry_a.to_arcis();
    let bucket_b = registry_b.to_arcis();
    // ... IBS scoring across MPC-secret-shared profiles ...
    score.reveal()
}
```

The MXE never sees either bucket in plaintext. Each Arx node holds a secret share. The IBS computation runs across the secret-shared state, and only the final score (a single `u8`) becomes public — and only after both users sign consent.

**Mutual-consent reveal.** A `MatchRequest` PDA holds the state machine: `Pending → Consented → Computing → Revealed`. The MXE only runs when both users have signed consent. The reveal is the single number — nothing else is exposed about either profile.

---

## V. The matching algorithm

Kindred uses **IBS (Identity-by-State) scoring over the 20 expanded CODIS loci** (the FBI's expanded panel, effective January 2017). At each locus, both individuals have an unordered pair of allele integers `{a1, a2}` and `{b1, b2}`. Per-locus IBS is 0, 1, or 2:

- **2** if both alleles match (genotypes identical)
- **1** if exactly one allele in common
- **0** if no allele in common

Total score = sum across 20 loci, range 0–40.

The implementation is branchless to keep execution time independent of allele values:

```rust
fn ibs_locus(a1: u8, a2: u8, b1: u8, b2: u8) -> u8 {
    let any_share  = ((a1 == b1) || (a1 == b2) || (a2 == b1) || (a2 == b2)) as u8;
    let geno_match = (((a1 == b1) && (a2 == b2)) || ((a1 == b2) && (a2 == b1))) as u8;
    any_share + geno_match
}
```

In MPC, both `if` branches always execute. We rely on this: conditional logic via boolean AND/OR/multiplication keeps execution time independent of the secret allele values, which is essential for hiding which positions matched.

Expected total IBS by relationship:

| Relationship | Expected IBS |
|---|---|
| Identical / duplicate | 40 |
| Parent–child | exactly 20 minimum (≥1 per locus by inheritance) |
| Full sibling | ~25 |
| Half-sibling / avuncular / first cousin | ~15 |
| Unrelated | ~10 |

---

## VI. The honest disclosure

Twenty STR loci reliably distinguish parent-child and full siblings from unrelated individuals. **They do not reliably distinguish second-degree relatives** (half-sibling, avuncular, first cousin) from each other or from the unrelated baseline. The variance dominates.

Modern consumer relative-finders (23andMe, AncestryDNA) use SNP arrays with 600,000+ markers — orders of magnitude more discriminating power. Kindred v1 explicitly limits its claims to first-degree relative detection. We do not claim "find your fifth cousin." We claim what is true: **for the populations Kindred serves — where confirming parentage, sibship, or close kinship is the most common need — 20 STRs are enough, and the MPC infrastructure is the missing piece.**

v2 scales to SNP-array matching when Arcium circuit limits expand. Today, the federation primitive itself is the contribution.

---

## VII. The threat model

Kindred protects against:
- **The org operator** — admins cannot read their own org's bucket contents
- **Cross-org data leakage** — Org A cannot read Org B's data, even when federated
- **The Arcium validators** — under the Cerberus protocol's dishonest-majority assumption, no individual Arx node can reconstruct profile contents
- **The chain observer** — all profile data is encrypted ciphertext on-chain
- **The breach** — there is no centralized plaintext database to breach

Kindred does NOT protect against (v1 disclosed):
- **Wallet linkability** — the wallet that registered a profile is publicly observable
- **Adversarial profile pre-commit** — a malicious org could seed dummy profiles designed to score-bomb a target. v2 requires lab-attested profiles
- **Side channels on individual Arx nodes** — out of scope of the cryptographic protocol
- **Real-DNA chain-of-custody** — v1 is synthetic-only; v2 needs accredited lab integration

Full discussion in the [THREAT_MODEL.md](THREAT_MODEL.md).

---

## VIII. Why this matters

The populations Kindred serves are not theoretical. About 7 million Americans were adopted; many of them in states where birth records remain sealed. About 30,000–60,000 children are born globally each year via gamete donation, into a fertility-industry contract of donor anonymity that consumer DNA databases broke unilaterally. The ICRC processes thousands of family-tracing cases each year. Diaspora communities under hostile-state surveillance number in the tens of millions worldwide.

For all of them, the architectural choice between centralized and MPC-federated is not a preference. It is the difference between participating and being shut out.

**Kindred is the first product to give them a system that respects their threat model.**

---

## IX. What's next

- **SNP-scale matching** when Arcium circuit limits expand. The same protocol scales — the bucket structure simply holds packed SNP genotypes instead of STR allele integers.
- **Real org onboarding** with multi-sig admins and KYB flow. v1 demo orgs are illustrative; v2 partners with named institutions.
- **Stealth-address registration** to remove wallet-linkability.
- **Lab-attested profiles** to defend against adversarial pre-commit.
- **Mainnet deploy** following Arcium mainnet-alpha maturation.

Partnership conversations welcome — particularly with adoption-rights organizations (Bastard Nation, Adoptee Rights Law Center), donor-conceived advocacy (We Are Donor Conceived), and ICRC-affiliated tracing networks.

---

## X. Acknowledgments

Built on **Arcium** (the encrypted supercomputer on Solana). The MPC infrastructure layer that makes cross-organizational compute possible.

Built with **Solana** and **Anchor 0.32.1**.

Prior art acknowledgement: academic literature on secure multiparty kinship computation (Naveed et al. 2014, Aziz et al. 2017) framed the cryptographic primitives we operationalize. Their work was research; Kindred is the first to ship it as institutional infrastructure.

Open source under MIT. Code: [github.com/...kindred](#).

---

*If you work for an organization that would benefit from federation infrastructure for genomic matching, get in touch.*
