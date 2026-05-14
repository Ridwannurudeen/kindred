import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PERSONAS } from "../lib/personas";
import { parseCodisCsv } from "../lib/codis-parser";

export function Onboarding() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const personaId = params.get("persona");
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  const [csv, setCsv] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [alleles, setAlleles] = useState<number[] | null>(null);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    // Auto-load the resolved persona profile (demo only; in production the
    // user uploads their own CSV). persona always resolves — it falls back
    // to PERSONAS[0] — so this runs even when Onboarding is reached via the
    // hero CTA with no ?persona= param.
    const profileId = `${persona.orgId}-001`;
    fetch(`/synthetic-profiles/${profileId}.csv`)
      .then((r) => (r.ok ? r.text() : Promise.reject(`No demo profile for ${profileId}`)))
      .then((text) => setCsv(text))
      .catch(() => {
        // Fallback: empty so user can paste manually
      });
  }, [persona.orgId]);

  function onParse() {
    const result = parseCodisCsv(csv);
    if (!result.ok) {
      setParseError(result.error);
      setAlleles(null);
    } else {
      setParseError(null);
      setAlleles(result.alleles);
    }
  }

  async function onRegister() {
    // TODO: hook up real Solana + Arcium register_profile call.
    // For demo this just simulates registration with a 1.5s delay.
    await new Promise((r) => setTimeout(r, 1500));
    setRegistered(true);
    setTimeout(() => nav("/browse"), 1200);
  }

  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">Step 1 — Encrypt + register</div>
        <h1 style={{ fontSize: 36 }}>
          You are <em>{persona.name}</em>.
        </h1>
        <p className="lead">
          Your CODIS STR profile will be encrypted in this browser before it leaves your device.
          The plaintext genome never touches Kindred, the {persona.org}, or any Arcium node.
        </p>
      </div>

      <div className="card">
        <div className="row-between mb-2">
          <strong>CODIS profile</strong>
          <span className="org-badge">{persona.orgId}</span>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="locus,allele1,allele2&#10;D3S1358,15,17&#10;..."
          rows={12}
          style={{
            width: "100%",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <div className="row mt-2">
          <button onClick={onParse}>Parse + validate</button>
          {alleles && (
            <span className="text-mono text-small" style={{ color: "var(--accent)" }}>
              ✓ 20 loci, 40 alleles parsed
            </span>
          )}
          {parseError && (
            <span className="text-small" style={{ color: "var(--error)" }}>
              {parseError}
            </span>
          )}
        </div>

        {alleles && (
          <>
            <div className="section-header" style={{ marginTop: 32 }}>
              Encryption preview
            </div>
            <div className="crypto-preview">
              <span className="label">PLAINTEXT (40 alleles, this is what STAYS IN YOUR BROWSER)</span>
              {alleles.map((a, i) => `${a.toString().padStart(2, "0")}${(i + 1) % 8 === 0 ? "\n" : " "}`).join("")}
              <br />
              <br />
              <span className="label">CIPHERTEXT (after x25519 ECDH + Rescue cipher — what goes on-chain)</span>
              {generateMockCiphertext(alleles)}
              <br />
              <br />
              <span className="label">x25519 PUBKEY (ephemeral, this session only)</span>
              {generateMockPubkey()}
            </div>

            <div className="row mt-4">
              <button className="primary" onClick={onRegister} disabled={registered}>
                {registered ? "✓ Registered — redirecting..." : `Register encrypted profile → ${persona.org}`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function generateMockCiphertext(alleles: number[]): string {
  // Visual mock for the preview only. The real app uses RescueCipher from @arcium-hq/client.
  const seed = alleles.reduce((a, v) => (a * 31 + v) >>> 0, 0);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  let out = "";
  let s = seed;
  for (let i = 0; i < 64; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out += hex(s & 0xff);
    if ((i + 1) % 16 === 0) out += "\n";
  }
  return out.trim();
}

function generateMockPubkey(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  ).join("");
}
