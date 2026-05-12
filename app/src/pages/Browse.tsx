import { Link, useSearchParams } from "react-router-dom";
import { ORGS, PERSONAS, FEDERATION_AGREEMENTS } from "../lib/personas";

export function Browse() {
  const [params] = useSearchParams();
  const personaId = params.get("persona") ?? "maya";
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  const myOrg = ORGS.find((o) => o.id === persona.orgId)!;
  const federatedOrgIds = FEDERATION_AGREEMENTS.filter(
    (f) => f.a === persona.orgId || f.b === persona.orgId,
  ).map((f) => (f.a === persona.orgId ? f.b : f.a));
  const federatedOrgs = ORGS.filter((o) => federatedOrgIds.includes(o.id));

  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">Step 2 — Browse</div>
        <h1 style={{ fontSize: 36 }}>
          Find a possible relative.
        </h1>
        <p className="lead">
          Browse other registrants in your organization, or in federated organizations that
          agreed to allow cross-org matching. Identities stay anonymous — you only see slot
          numbers and opt-in flags.
        </p>
      </div>

      <div className="section-header">Your registry — {myOrg.name}</div>
      <div className="card-grid">
        {Array.from({ length: myOrg.memberCount }).map((_, i) => {
          const slotId = `${myOrg.id}-00${i + 1}`;
          const isYou = i === 0;
          return (
            <div key={slotId} className={`card ${isYou ? "" : "persona-card"}`}>
              <div className="row-between">
                <span className="text-mono">{slotId}</span>
                {isYou && <span className="org-badge">YOU</span>}
              </div>
              <div className="text-dim text-small mt-2">
                Registered • Opt-in: kinship + cross-org
              </div>
              {!isYou && (
                <Link
                  to={`/reveal/${myOrg.id}-001--${slotId}?persona=${personaId}&type=intra`}
                  className="btn mt-2"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Request match →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {federatedOrgs.length > 0 && (
        <>
          <div className="section-header">Federated registries</div>
          <p className="text-dim text-small mb-2">
            Your org has signed federation agreements with these. Cross-org matches go through MXE
            without either org seeing the other&apos;s data.
          </p>
          {federatedOrgs.map((org) => (
            <div key={org.id} className="mt-4">
              <div className="row-between mb-2">
                <strong>{org.name}</strong>
                <span className="org-badge cross-org">FEDERATED</span>
              </div>
              <div className="card-grid">
                {Array.from({ length: org.memberCount }).map((_, i) => {
                  const slotId = `${org.id}-00${i + 1}`;
                  return (
                    <div key={slotId} className="card persona-card">
                      <div className="row-between">
                        <span className="text-mono">{slotId}</span>
                        <span className="org-badge cross-org">{org.id}</span>
                      </div>
                      <div className="text-dim text-small mt-2">
                        Registered • Opt-in: cross-org
                      </div>
                      <Link
                        to={`/reveal/${myOrg.id}-001--${slotId}?persona=${personaId}&type=cross`}
                        className="btn mt-2"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        Request cross-org match →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
