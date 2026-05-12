import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { PERSONAS } from "../lib/personas";

export function Landing() {
  const nav = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <section className="hero">
        <div className="hero-eyebrow">Federated MPC infrastructure</div>
        <h1>
          Two adoption registries that <em>can&apos;t share data</em> — finally connected.
        </h1>
        <p className="lead">
          Adoption agencies, refugee networks, donor-conceived registries, diaspora heritage
          organizations: each holds genetic data that can&apos;t be legally federated. Today they
          don&apos;t connect. Kindred is the first MPC primitive that lets them — without any
          organization seeing what the others have.
        </p>
        <div className="row">
          <Link to="/onboarding" className="btn primary">
            Try the demo →
          </Link>
          <Link to="/how-it-works" className="btn">
            How it works
          </Link>
        </div>
      </section>

      <div className="section-header">Pick a persona</div>
      <p className="text-dim mb-2" style={{ fontSize: 14 }}>
        Each persona represents a real population currently underserved by centralized DNA services.
        The demo is end-to-end: encrypted profile upload → MXE-computed kinship → mutual-consent reveal.
      </p>

      <div className="card-grid">
        {PERSONAS.map((p) => (
          <div
            key={p.id}
            className={`card persona-card ${selected === p.id ? "selected" : ""}`}
            onClick={() => setSelected(p.id)}
            onDoubleClick={() => nav(`/onboarding?persona=${p.id}`)}
          >
            <div className="persona-tag">{p.tag}</div>
            <div className="persona-name">{p.name}</div>
            <div className="persona-org">
              <span className="org-badge">{p.orgId}</span> {p.org}
            </div>
            <div className="persona-search">{p.search}</div>
            {p.partner && (
              <div className="text-tiny text-dim mt-2">
                Demo partner: {p.partner.profileId} (
                {p.partner.relationship}, expected IBS ≈ {p.partner.expectedScore})
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="row mt-4" style={{ justifyContent: "center" }}>
          <Link to={`/onboarding?persona=${selected}`} className="btn primary">
            Continue as {PERSONAS.find((p) => p.id === selected)?.name} →
          </Link>
        </div>
      )}

      <div className="section-header">The architectural claim</div>
      <p className="text-dim" style={{ fontSize: 15, lineHeight: 1.65 }}>
        Centralized intermediaries fail (23andMe-style breach). TEE federation fails on single-org
        compromise. ZKPs prove statements but don&apos;t enable joint computation. <strong style={{ color: "var(--text)" }}>MPC is
        the only primitive where joint computation happens without joint data access.</strong> Kindred
        is the first product to use it for the populations who can&apos;t afford to be in 23andMe.
      </p>
    </>
  );
}
