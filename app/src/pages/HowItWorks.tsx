export function HowItWorks() {
  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">How it works</div>
        <h1 style={{ fontSize: 36 }}>The federation primitive, explained.</h1>
      </div>

      <div className="section-header">Why MPC, not TEE or ZKP</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: 12, color: "var(--text-dim)" }}>Architecture</th>
            <th style={{ textAlign: "left", padding: 12, color: "var(--text-dim)" }}>Failure mode</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: 12 }}>Centralized intermediary</td>
            <td style={{ padding: 12, color: "var(--text-dim)" }}>
              Single party sees both orgs&apos; data. Same as 23andMe pre-breach.
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: 12 }}>TEE federation</td>
            <td style={{ padding: 12, color: "var(--text-dim)" }}>
              One org&apos;s enclave compromise leaks all federated orgs&apos; data.
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: 12 }}>ZKP</td>
            <td style={{ padding: 12, color: "var(--text-dim)" }}>
              Proves statements about own data; no joint-input compute primitive.
            </td>
          </tr>
          <tr>
            <td style={{ padding: 12, color: "var(--accent)", fontWeight: 500 }}>MPC (Arcium)</td>
            <td style={{ padding: 12, color: "var(--text)" }}>
              Joint computation without joint data access. The only primitive that works.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="section-header">The kinship algorithm</div>
      <p className="text-dim text-small" style={{ lineHeight: 1.7 }}>
        IBS (Identity-by-State) over 20 expanded CODIS loci. At each locus, both individuals have
        an unordered pair of allele integers. Per-locus IBS is 0, 1, or 2 (no shared / one shared /
        both shared, where genotypes match). Total score = sum across 20 loci, range 0–40.
      </p>

      <div className="section-header">Score interpretation</div>
      {[
        ["38–40", "Identical / duplicate sample", "Same person or identical twin"],
        ["22–37", "Likely full sibling", "Parent-child also possible at 22–25"],
        ["19–21", "Parent–child", "≥1 allele guaranteed shared per locus by inheritance"],
        ["13–18", "Second-degree", "Half-sib, avuncular, grandparent, first cousin — needs SNP-array for confidence"],
        ["0–12", "No detectable kinship", "Random unrelated background ~10"],
      ].map(([range, label, detail]) => (
        <div key={range} className="score-interp">
          <div className="range">{range}</div>
          <div>
            <div>{label}</div>
            <div className="text-dim text-small">{detail}</div>
          </div>
        </div>
      ))}

      <div className="section-header">Honest limitations of 20 STRs</div>
      <p className="text-dim text-small" style={{ lineHeight: 1.7 }}>
        20 STR loci reliably distinguish parent-child and full siblings from unrelated. Beyond
        2nd-degree relatives, variance dominates and IBS distributions overlap. Modern consumer
        relative-finders use SNP arrays (600K+ markers). We do not claim 5th-cousin discovery, and
        we&apos;re explicit about that in the writeup. v2 scales to SNP-array matching when Arcium
        circuit limits expand.
      </p>

      <div className="section-header">Read more</div>
      <ul className="text-dim text-small" style={{ lineHeight: 1.8, paddingLeft: 24 }}>
        <li>
          <a href="https://github.com/Ridwannurudeen/kindred/blob/master/docs/CIRCUIT_DESIGN.md" style={{ color: "var(--accent)" }}>
            CIRCUIT_DESIGN.md
          </a>{" "}
          — branchless IBS proof + hand-traced cases
        </li>
        <li>
          <a href="https://github.com/Ridwannurudeen/kindred/blob/master/docs/THREAT_MODEL.md" style={{ color: "var(--accent)" }}>
            THREAT_MODEL.md
          </a>{" "}
          — what Kindred protects, what it doesn&apos;t
        </li>
        <li>
          <a href="https://github.com/Ridwannurudeen/kindred/blob/master/docs/ARCHITECTURE.md" style={{ color: "var(--accent)" }}>
            ARCHITECTURE.md
          </a>{" "}
          — sequence diagrams + system layers
        </li>
        <li>
          <a href="https://docs.arcium.com" style={{ color: "var(--accent)" }}>
            Arcium docs
          </a>{" "}
          — the MPC infrastructure layer
        </li>
      </ul>
    </>
  );
}
