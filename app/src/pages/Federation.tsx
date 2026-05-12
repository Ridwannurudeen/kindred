import { ORGS, FEDERATION_AGREEMENTS } from "../lib/personas";

export function Federation() {
  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">The federation graph</div>
        <h1 style={{ fontSize: 36 }}>Institutional silos, joined cryptographically.</h1>
        <p className="lead">
          Each organization holds its own encrypted member bucket. Two orgs can sign a public
          on-chain federation agreement, after which their members may opt in to cross-org
          matching. Neither org can read the other&apos;s data — at any point, ever.
        </p>
      </div>

      <div className="section-header">Organizations on Kindred</div>
      <div className="card-grid">
        {ORGS.map((org) => (
          <div key={org.id} className="card">
            <div className="row-between">
              <strong>{org.name}</strong>
              <span className="org-badge">{org.id}</span>
            </div>
            <div className="text-dim text-small mt-2">
              {org.memberCount} registered members
            </div>
          </div>
        ))}
      </div>

      <div className="section-header">Active federation agreements</div>
      {FEDERATION_AGREEMENTS.map((f) => {
        const orgA = ORGS.find((o) => o.id === f.a)!;
        const orgB = ORGS.find((o) => o.id === f.b)!;
        return (
          <div key={`${f.a}-${f.b}`} className="card mt-2">
            <div className="row-between">
              <div>
                <strong>{orgA.name}</strong>
                <span style={{ color: "var(--accent)", margin: "0 12px" }}>↔</span>
                <strong>{orgB.name}</strong>
              </div>
              <span className="text-mono text-tiny text-dim">Signed {f.signedAt}</span>
            </div>
            <div className="text-dim text-small mt-2">
              Members of {orgA.id} can request cross-org matches with members of {orgB.id} (and vice
              versa) when both have opted in. The MXE runs the cross_org_match circuit over both
              encrypted buckets without revealing either to the other org.
            </div>
          </div>
        );
      })}

      <div className="section-header">What chain observers can see</div>
      <ul className="text-dim text-small" style={{ lineHeight: 1.8, paddingLeft: 24 }}>
        <li>Number of orgs and members per org (public counts)</li>
        <li>Federation agreements (public commitments)</li>
        <li>Match request lifecycle states (Pending → Consented → Computing → Revealed)</li>
        <li>Final IBS score, ONLY after both users consent</li>
      </ul>

      <div className="section-header">What chain observers CANNOT see</div>
      <ul className="text-dim text-small" style={{ lineHeight: 1.8, paddingLeft: 24 }}>
        <li>Profile contents (encrypted under MXE collective key)</li>
        <li>Pairwise scores between non-consenting members</li>
        <li>Which specific cross-org pair triggered any match (target indices encrypted at request time in v2)</li>
      </ul>
    </>
  );
}
