/**
 * CODIS CSV parser. Expected format:
 *   locus,allele1,allele2
 *   D3S1358,15,17
 *   ...
 *
 * Validates against the 20-locus expanded CODIS panel.
 */

export const CODIS_PANEL = [
  "D3S1358", "vWA", "FGA", "D8S1179", "D21S11",
  "D18S51", "D5S818", "D13S317", "D7S820", "D16S539",
  "TH01", "TPOX", "CSF1PO", "D1S1656", "D2S441",
  "D2S1338", "D10S1248", "D12S391", "D19S433", "D22S1045",
];

export type ParseResult =
  | { ok: true; alleles: number[] /* 40 u8s */ }
  | { ok: false; error: string };

export function parseCodisCsv(csv: string): ParseResult {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"));

  if (lines.length < 2) {
    return { ok: false, error: "Empty CSV" };
  }

  const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
  if (header[0] !== "locus" || header[1] !== "allele1" || header[2] !== "allele2") {
    return { ok: false, error: "Header must be: locus,allele1,allele2" };
  }

  const byLocus: Record<string, [number, number]> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((s) => s.trim());
    if (cols.length < 3) continue;

    const locus = cols[0];
    const a1 = parseInt(cols[1], 10);
    const a2 = parseInt(cols[2], 10);

    if (!CODIS_PANEL.includes(locus)) {
      return { ok: false, error: `Unknown locus: ${locus} (not in CODIS expanded panel)` };
    }
    if (Number.isNaN(a1) || Number.isNaN(a2) || a1 < 0 || a2 < 0 || a1 > 255 || a2 > 255) {
      return { ok: false, error: `Invalid allele values at locus ${locus}: ${cols[1]}, ${cols[2]}` };
    }

    byLocus[locus] = [a1, a2];
  }

  for (const locus of CODIS_PANEL) {
    if (!byLocus[locus]) {
      return { ok: false, error: `Missing locus: ${locus}` };
    }
  }

  const alleles: number[] = [];
  for (const locus of CODIS_PANEL) {
    alleles.push(byLocus[locus][0]);
    alleles.push(byLocus[locus][1]);
  }

  return { ok: true, alleles };
}
