import { Link } from "react-router-dom";

export function Inbox() {
  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">Inbox</div>
        <h1 style={{ fontSize: 36 }}>Pending match requests</h1>
        <p className="lead">
          Someone wants to compute kinship with you. Accepting will queue the MXE computation;
          only you and the requester will learn the IBS score. Rejecting closes the request.
        </p>
      </div>

      <div className="card">
        <div className="row-between mb-2">
          <strong>Match request</strong>
          <span className="text-mono text-small text-dim">2026-05-08 14:22 UTC</span>
        </div>
        <p className="text-small text-dim mb-2">
          From: <span className="text-mono">OAR-001</span> (Oregon Adoption Registry) →{" "}
          <span className="org-badge cross-org">CROSS-ORG</span>
        </p>
        <p className="text-small mb-2">
          They&apos;ve opted into cross-org matching. If you accept, an MXE computation will run
          over both org buckets. The score (a single u8) will be revealed to both of you.
          Profiles stay encrypted forever.
        </p>
        <div className="row mt-2">
          <Link to="/reveal/OAR-001--TAR-002?type=cross" className="btn primary">
            Accept + compute
          </Link>
          <button>Reject</button>
        </div>
      </div>

      <div className="card mt-4" style={{ background: "transparent", borderStyle: "dashed" }}>
        <div className="text-dim text-small">No other pending requests.</div>
      </div>
    </>
  );
}
