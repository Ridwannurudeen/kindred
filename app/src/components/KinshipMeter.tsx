import { useEffect, useState } from "react";
import { interpretScore } from "../lib/relationship";

export function KinshipMeter({ targetScore, isCrossOrg }: { targetScore: number; isCrossOrg: boolean }) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 1800;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(eased * targetScore));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetScore]);

  const band = interpretScore(displayScore);
  const pct = Math.min(100, (displayScore / 40) * 100);

  return (
    <div className="kinship-meter">
      <div className="text-mono text-tiny" style={{ color: "var(--text-dim)", textAlign: "center" }}>
        IBS score (0–40) — Identity by State across 20 CODIS loci
        {isCrossOrg && (
          <span className="org-badge cross-org" style={{ marginLeft: 12 }}>
            CROSS-ORG MATCH
          </span>
        )}
      </div>
      <div className="kinship-score">{displayScore}</div>
      <div className="kinship-bar">
        <div className="kinship-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="kinship-label">{band.label}</div>
      <div className="kinship-detail">{band.detail}</div>
    </div>
  );
}
