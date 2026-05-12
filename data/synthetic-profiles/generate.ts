/**
 * Synthetic CODIS STR profile generator with seeded Mendelian inheritance.
 *
 * Produces 25 profiles across 5 orgs (5 each) with documented relationships
 * for the Kindred demo. All profiles are SYNTHETIC — never real DNA.
 *
 * Usage: npx ts-node generate.ts > profiles.json
 *
 * Relationship matrix (see relationships.json output):
 * - Maya (OAR-001) ↔ Profile #102 (TAR-002): parent-child, IBS = 20 (CROSS-ORG)
 * - Aiden (DCN-001) ↔ Profile #204 (DCN-004): half-sibling (shared donor), IBS ≈ 15
 * - Noor (UNHCR-001): no kinship match in registry (true negative)
 * - Ren (DHF-001) ↔ Profile #408 (DHF-003): avuncular (uncle), IBS ≈ 15
 */

import * as crypto from "crypto";
import * as fs from "fs";

// 20 expanded CODIS loci (effective Jan 2017+) with realistic allele ranges
const CODIS_LOCI = [
  { name: "D3S1358", min: 8, max: 20 },
  { name: "vWA", min: 11, max: 24 },
  { name: "FGA", min: 17, max: 30 },
  { name: "D8S1179", min: 7, max: 18 },
  { name: "D21S11", min: 24, max: 38 },
  { name: "D18S51", min: 7, max: 27 },
  { name: "D5S818", min: 7, max: 17 },
  { name: "D13S317", min: 5, max: 17 },
  { name: "D7S820", min: 5, max: 16 },
  { name: "D16S539", min: 5, max: 16 },
  { name: "TH01", min: 4, max: 14 },
  { name: "TPOX", min: 6, max: 14 },
  { name: "CSF1PO", min: 6, max: 16 },
  { name: "D1S1656", min: 9, max: 21 },
  { name: "D2S441", min: 8, max: 17 },
  { name: "D2S1338", min: 15, max: 28 },
  { name: "D10S1248", min: 8, max: 19 },
  { name: "D12S391", min: 14, max: 27 },
  { name: "D19S433", min: 9, max: 19 },
  { name: "D22S1045", min: 8, max: 20 },
];

const NUM_LOCI = 20;

type Profile = {
  id: string;
  org: string;
  alleles: number[]; // 40 u8s: [locus0_a, locus0_b, locus1_a, locus1_b, ...]
  notes?: string;
};

type Rng = () => number;

function seededRng(seed: string): Rng {
  let h = crypto.createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = crypto.createHash("sha256").update(h).digest();
      i = 0;
    }
    const v = h.readUInt32LE(i);
    i += 4;
    return v / 0xffffffff;
  };
}

function randAllele(rng: Rng, locus: typeof CODIS_LOCI[0]): number {
  return locus.min + Math.floor(rng() * (locus.max - locus.min + 1));
}

function randomProfile(rng: Rng): number[] {
  const a: number[] = [];
  for (const locus of CODIS_LOCI) {
    a.push(randAllele(rng, locus));
    a.push(randAllele(rng, locus));
  }
  return a;
}

/**
 * Mendelian child: at each locus, inherit one allele from parent A, one from parent B.
 */
function mendelianChild(rng: Rng, a: number[], b: number[]): number[] {
  const child: number[] = [];
  for (let i = 0; i < NUM_LOCI; i++) {
    // Pick one allele from parent A's locus pair (alleles 2i, 2i+1)
    const fromA = a[2 * i + (rng() < 0.5 ? 0 : 1)];
    const fromB = b[2 * i + (rng() < 0.5 ? 0 : 1)];
    child.push(fromA);
    child.push(fromB);
  }
  return child;
}

/**
 * Compute IBS score between two profiles for sanity-check.
 */
function ibs(a: number[], b: number[]): number {
  let score = 0;
  for (let i = 0; i < NUM_LOCI; i++) {
    const a1 = a[2 * i],
      a2 = a[2 * i + 1];
    const b1 = b[2 * i],
      b2 = b[2 * i + 1];
    const anyShare =
      a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2 ? 1 : 0;
    const genoMatch =
      (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1) ? 1 : 0;
    score += anyShare + genoMatch;
  }
  return score;
}

function profileToCsv(p: Profile): string {
  let csv = "locus,allele1,allele2\n";
  for (let i = 0; i < NUM_LOCI; i++) {
    csv += `${CODIS_LOCI[i].name},${p.alleles[2 * i]},${p.alleles[2 * i + 1]}\n`;
  }
  return csv;
}

// === SEEDED RELATIONSHIPS ===

const profiles: Profile[] = [];
const r = seededRng("kindred-demo-v1");

// --- Oregon Adoption Registry (OAR) — 5 profiles
// Maya (OAR-001) is an adoptee. Her biological mother is in TAR (cross-org match).
// Maya's bio father is generated independently; only mother is registered.
const mayaBioFather = randomProfile(seededRng("maya-bio-father"));
const mayaBioMother = randomProfile(seededRng("maya-bio-mother"));

const maya: Profile = {
  id: "OAR-001",
  org: "Oregon Adoption Registry",
  alleles: mendelianChild(r, mayaBioFather, mayaBioMother),
  notes: "Maya — adoptee, looking for biological parents",
};
profiles.push(maya);

// Other OAR profiles (unrelated to Maya)
for (let i = 2; i <= 5; i++) {
  profiles.push({
    id: `OAR-00${i}`,
    org: "Oregon Adoption Registry",
    alleles: randomProfile(r),
    notes: "Unrelated registrant",
  });
}

// --- Texas Adoption Registry (TAR) — 5 profiles
// Maya's biological mother is TAR-002 (the cross-org match)
const mayaBioMotherProfile: Profile = {
  id: "TAR-002",
  org: "Texas Adoption Registry",
  alleles: mayaBioMother,
  notes: "Maya's biological mother (cross-org match for OAR-001)",
};
profiles.push({
  id: "TAR-001",
  org: "Texas Adoption Registry",
  alleles: randomProfile(r),
  notes: "Unrelated registrant",
});
profiles.push(mayaBioMotherProfile);
for (let i = 3; i <= 5; i++) {
  profiles.push({
    id: `TAR-00${i}`,
    org: "Texas Adoption Registry",
    alleles: randomProfile(r),
    notes: "Unrelated registrant",
  });
}

// --- Donor-Conceived Network (DCN) — 5 profiles
// Aiden (DCN-001) and Profile DCN-004 share the same donor (half-siblings)
const sharedDonor = randomProfile(seededRng("dcn-shared-donor-7421"));
const aidenMother = randomProfile(seededRng("aiden-mother"));
const dcn004Mother = randomProfile(seededRng("dcn-004-mother"));

profiles.push({
  id: "DCN-001",
  org: "Donor-Conceived Network",
  alleles: mendelianChild(r, sharedDonor, aidenMother),
  notes: "Aiden — donor-conceived, looking for half-siblings",
});
profiles.push({
  id: "DCN-002",
  org: "Donor-Conceived Network",
  alleles: randomProfile(r),
  notes: "Unrelated registrant (different donor)",
});
profiles.push({
  id: "DCN-003",
  org: "Donor-Conceived Network",
  alleles: randomProfile(r),
  notes: "Unrelated registrant (different donor)",
});
profiles.push({
  id: "DCN-004",
  org: "Donor-Conceived Network",
  alleles: mendelianChild(r, sharedDonor, dcn004Mother),
  notes: "Aiden's half-sibling (shared donor #7421)",
});
profiles.push({
  id: "DCN-005",
  org: "Donor-Conceived Network",
  alleles: randomProfile(r),
  notes: "Unrelated registrant (different donor)",
});

// --- UNHCR Family Tracing (UNHCR) — 5 profiles
// Noor (UNHCR-001) has NO match in the registry (true negative demo)
profiles.push({
  id: "UNHCR-001",
  org: "UNHCR Family Tracing",
  alleles: randomProfile(seededRng("noor")),
  notes: "Noor — refugee, looking for separated cousin (no match in registry)",
});
for (let i = 2; i <= 5; i++) {
  profiles.push({
    id: `UNHCR-00${i}`,
    org: "UNHCR Family Tracing",
    alleles: randomProfile(r),
    notes: "Unrelated registrant",
  });
}

// --- Diaspora Heritage Foundation (DHF) — 5 profiles
// Ren (DHF-001) and DHF-003 are uncle-nephew (avuncular)
// To make avuncular: DHF-003 is Ren's father's brother
const renGrandfather = randomProfile(seededRng("ren-grandfather"));
const renGrandmother = randomProfile(seededRng("ren-grandmother"));
const renFather = mendelianChild(seededRng("ren-father"), renGrandfather, renGrandmother);
const renUncle = mendelianChild(seededRng("ren-uncle"), renGrandfather, renGrandmother); // sibling of Ren's father
const renMother = randomProfile(seededRng("ren-mother"));

profiles.push({
  id: "DHF-001",
  org: "Diaspora Heritage Foundation",
  alleles: mendelianChild(r, renFather, renMother),
  notes: "Ren — diaspora, looking for estranged uncle",
});
profiles.push({
  id: "DHF-002",
  org: "Diaspora Heritage Foundation",
  alleles: randomProfile(r),
  notes: "Unrelated registrant",
});
profiles.push({
  id: "DHF-003",
  org: "Diaspora Heritage Foundation",
  alleles: renUncle,
  notes: "Ren's paternal uncle (avuncular relationship)",
});
profiles.push({
  id: "DHF-004",
  org: "Diaspora Heritage Foundation",
  alleles: randomProfile(r),
  notes: "Unrelated registrant",
});
profiles.push({
  id: "DHF-005",
  org: "Diaspora Heritage Foundation",
  alleles: randomProfile(r),
  notes: "Unrelated registrant",
});

// === RELATIONSHIP GROUND TRUTH ===
//
// IBS score interpretation over 20 CODIS loci. Per locus contribution is {0,1,2}
// for {no shared alleles, one shared allele, full genotype match}.
//
// Parent-child shares ≥1 allele per locus by inheritance, so floor is 20. The
// non-inherited child allele can coincidentally match the parent's other copy,
// pushing the locus contribution to 2 — observed empirically a handful of times
// across 20 loci. Realistic parent-child IBS distribution: 20-26.
//
//   identical       40
//   parent-child    20-26 (≥20 by Mendelian inheritance, +random coincidence)
//   full sibling    20-32 (mean ~25)
//   half-sibling    12-20 (mean ~15)
//   avuncular       12-20 (kinship coefficient 0.125, same as half-sib)
//   first cousin    10-16
//   unrelated       0-14  (random allele coincidences across 20 loci)

const IBS_RANGES = {
  identical: { min: 40, max: 40 },
  parentChild: { min: 20, max: 26 },
  fullSibling: { min: 20, max: 32 },
  halfSibling: { min: 12, max: 20 },
  avuncular: { min: 12, max: 20 },
  firstCousin: { min: 10, max: 16 },
  unrelated: { min: 0, max: 14 },
};

type RelationshipClass = keyof typeof IBS_RANGES;

type Pair = {
  a: string;
  b: string;
  expected: RelationshipClass;
  crossOrg: boolean;
  demo?: string;
  notes: string;
};

const profileById = new Map(profiles.map((p) => [p.id, p]));
const orgById = (id: string) => profileById.get(id)!.org;

function makePair(p: Pair) {
  const a = profileById.get(p.a)!.alleles;
  const b = profileById.get(p.b)!.alleles;
  const computedIbs = ibs(a, b);
  const range = IBS_RANGES[p.expected];
  const inRange = computedIbs >= range.min && computedIbs <= range.max;
  return {
    a: p.a,
    b: p.b,
    orgA: orgById(p.a),
    orgB: orgById(p.b),
    expected: p.expected,
    expectedIbsRange: range,
    computedIbs,
    inExpectedRange: inRange,
    crossOrg: p.crossOrg,
    demo: p.demo,
    notes: p.notes,
  };
}

// Designed positive matches (the 4 demo storylines)
const positiveMatches: Pair[] = [
  {
    a: "OAR-001",
    b: "TAR-002",
    expected: "parentChild",
    crossOrg: true,
    demo: "Maya cross-org centerpiece",
    notes: "Maya (Oregon adoptee) ↔ biological mother (Texas registry) — federation primitive demo",
  },
  {
    a: "DCN-001",
    b: "DCN-004",
    expected: "halfSibling",
    crossOrg: false,
    demo: "Aiden donor-conceived intra-org",
    notes: "Shared anonymous donor #7421 — intra-org half-sibling discovery",
  },
  {
    a: "DHF-001",
    b: "DHF-003",
    expected: "avuncular",
    crossOrg: false,
    demo: "Ren diaspora intra-org",
    notes: "Paternal uncle-nephew — avuncular (kinship coefficient 0.125)",
  },
];

// Negative controls — pairs that must NOT match. Drawn across orgs and within
// orgs to verify both intra and cross-org returns sub-threshold scores.
const negativeControls: Pair[] = [
  {
    a: "UNHCR-001",
    b: "UNHCR-002",
    expected: "unrelated",
    crossOrg: false,
    demo: "Noor true-negative",
    notes: "Noor (refugee, no kin in registry) ↔ unrelated UNHCR registrant",
  },
  {
    a: "OAR-001",
    b: "OAR-002",
    expected: "unrelated",
    crossOrg: false,
    notes: "Maya ↔ unrelated Oregon registrant — intra-org negative",
  },
  {
    a: "OAR-001",
    b: "TAR-001",
    expected: "unrelated",
    crossOrg: true,
    notes: "Maya ↔ unrelated Texas registrant — cross-org negative (federation w/ no match)",
  },
  {
    a: "DCN-001",
    b: "DCN-002",
    expected: "unrelated",
    crossOrg: false,
    notes: "Aiden ↔ different-donor DCN registrant",
  },
  {
    a: "DHF-001",
    b: "DHF-002",
    expected: "unrelated",
    crossOrg: false,
    notes: "Ren ↔ unrelated DHF registrant",
  },
  {
    a: "OAR-003",
    b: "DHF-004",
    expected: "unrelated",
    crossOrg: true,
    notes: "Random unrelated cross-org pair — federation noise floor",
  },
];

const allPairs = [...positiveMatches, ...negativeControls].map(makePair);

// === SANITY-CHECK IBS (stderr) ===
console.error("=== Expected vs computed IBS ===");
for (const p of allPairs) {
  const flag = p.inExpectedRange ? "OK" : "OUT OF RANGE";
  console.error(
    `[${flag}] ${p.a} ↔ ${p.b} (${p.expected}): computed=${p.computedIbs}, expected=${p.expectedIbsRange.min}-${p.expectedIbsRange.max}`
  );
}
const failures = allPairs.filter((p) => !p.inExpectedRange);
if (failures.length > 0) {
  console.error(
    `\nWARNING: ${failures.length} pair(s) out of expected IBS range. ` +
      `This is statistical for distant relationships but indicates a generator bug if seen in parent-child.`
  );
}

// === WRITE OUTPUTS ===

// JSON master file (machine-readable)
const out = {
  generated: new Date().toISOString(),
  seed: "kindred-demo-v1",
  loci: CODIS_LOCI,
  profiles: profiles,
  relationships: {
    "OAR-001<->TAR-002": "parent-child (cross-org)",
    "DCN-001<->DCN-004": "half-siblings (shared donor)",
    "DHF-001<->DHF-003": "avuncular (uncle-nephew)",
    "UNHCR-001": "no match in registry (true-negative demo)",
  },
};
fs.writeFileSync("profiles.json", JSON.stringify(out, null, 2));

// Structured ground-truth for tests + frontend demo loader
const relationshipsOut = {
  generated: new Date().toISOString(),
  seed: "kindred-demo-v1",
  description:
    "Ground truth for Kindred synthetic registry. Every pair listed here is consumed by tests/kinship.test.ts and the frontend demo loader to verify MXE-computed IBS against expected ranges.",
  ibsRanges: IBS_RANGES,
  positiveMatches: allPairs.filter((p) => p.expected !== "unrelated"),
  negativeControls: allPairs.filter((p) => p.expected === "unrelated"),
};
fs.writeFileSync("relationships.json", JSON.stringify(relationshipsOut, null, 2));

// Per-profile CSV (CODIS format) for upload demo
fs.mkdirSync("csv", { recursive: true });
for (const p of profiles) {
  fs.writeFileSync(`csv/${p.id}.csv`, profileToCsv(p));
}

console.error(
  `\nWrote ${profiles.length} profiles to profiles.json + csv/, ` +
    `${allPairs.length} pairs to relationships.json`
);
