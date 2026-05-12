/**
 * Map IBS score (0-40) to a biologically-grounded interpretation.
 *
 * Honest disclosure: 20 STR loci reliably distinguish parent-child and
 * full siblings from unrelated. Beyond 2nd-degree relatives, variance
 * dominates. We do NOT claim 5th-cousin discovery.
 */

export type RelationshipBand = {
  range: [number, number];
  label: string;
  detail: string;
  confidence: "high" | "medium" | "low";
};

export const RELATIONSHIP_BANDS: RelationshipBand[] = [
  {
    range: [38, 40],
    label: "Identical / duplicate sample",
    detail: "Likely same person or identical twin",
    confidence: "high",
  },
  {
    range: [22, 37],
    label: "Likely full sibling",
    detail: "Expected IBS for full siblings is ~25 (variance ±5). Could also be parent-child if score is 22-25.",
    confidence: "high",
  },
  {
    range: [19, 21],
    label: "Parent–child",
    detail: "Parent-child guarantees ≥1 shared allele per locus → IBS ≥ 20 (typical 19-22 with allele coincidences). Could also be a homozygous-allele full sibling.",
    confidence: "high",
  },
  {
    range: [13, 18],
    label: "Second-degree relative range",
    detail: "Half-sibling, avuncular (uncle/aunt), grandparent–grandchild, or first cousin. 20 STR markers cannot distinguish these reliably; SNP-array matching needed for confidence.",
    confidence: "medium",
  },
  {
    range: [0, 12],
    label: "No detectable kinship",
    detail: "Score is consistent with unrelated individuals (expected ~10 from random allele coincidences).",
    confidence: "high",
  },
];

export function interpretScore(score: number): RelationshipBand {
  for (const band of RELATIONSHIP_BANDS) {
    if (score >= band.range[0] && score <= band.range[1]) {
      return band;
    }
  }
  return RELATIONSHIP_BANDS[RELATIONSHIP_BANDS.length - 1];
}
