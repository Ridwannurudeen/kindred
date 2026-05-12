import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { KinshipMeter } from "../components/KinshipMeter";
import { PERSONAS } from "../lib/personas";

export function Reveal() {
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const personaId = params.get("persona") ?? "maya";
  const matchType = params.get("type") ?? "intra";
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  // Stage state machine: pending consent → MXE compute → reveal
  const [stage, setStage] = useState<"pending" | "consenting" | "computing" | "revealed">("pending");

  useEffect(() => {
    if (stage === "consenting") {
      const t1 = setTimeout(() => setStage("computing"), 800);
      return () => clearTimeout(t1);
    }
    if (stage === "computing") {
      const t2 = setTimeout(() => setStage("revealed"), 2400);
      return () => clearTimeout(t2);
    }
  }, [stage]);

  // Use the persona's expected score for the demo
  const expected = persona.partner?.expectedScore ?? 10;

  const [a, b] = matchId?.split("--") ?? ["", ""];

  return (
    <>
      <div className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow">Step 3 — Mutual consent + reveal</div>
        <h1 style={{ fontSize: 36 }}>
          Encrypted comparison
        </h1>
        <p className="lead">
          {matchType === "cross"
            ? "This is a CROSS-ORG match. Your profile lives in your org's encrypted bucket; theirs lives in another org's bucket. Neither org will see the other's data — only you and your match will see the IBS score."
            : "Both profiles live in the same org's encrypted bucket. The org admin holds the bucket but cannot read its contents. Only you and your match will see the IBS score."}
        </p>
      </div>

      <div className="card">
        <div className="row-between mb-2">
          <span className="text-mono text-small">Match ID</span>
          <span className="text-mono text-small text-dim">
            {a} ↔ {b}
          </span>
        </div>

        {stage === "pending" && (
          <>
            <p className="text-dim text-small mb-2">
              Your match request is in <code>Pending</code> state on-chain. The recipient must consent
              before MXE computation begins. (Demo skip: tap below to advance — in the real app,
              you&apos;d wait for the recipient&apos;s wallet to sign.)
            </p>
            <button className="primary" onClick={() => setStage("consenting")}>
              Simulate recipient consent →
            </button>
          </>
        )}

        {stage === "consenting" && <StageDot label="Recipient signed consent" />}

        {stage === "computing" && (
          <>
            <StageDot label="Cluster running cross_org_match circuit..." active />
            <p className="text-mono text-tiny text-dim mt-2" style={{ lineHeight: 1.7 }}>
              {`> queue_computation cross_org_match`}
              <br />
              {`> input: a_idx, b_idx, registry_a (ciphertext), registry_b (ciphertext)`}
              <br />
              {`> Arx nodes (Cerberus protocol) processing secret-shared buckets...`}
              <br />
              {`> verify_output() pending`}
            </p>
          </>
        )}

        {stage === "revealed" && (
          <KinshipMeter targetScore={expected} isCrossOrg={matchType === "cross"} />
        )}
      </div>

      {stage === "revealed" && (
        <div className="card mt-4">
          <div className="section-header" style={{ marginTop: 0 }}>What just happened</div>
          <p className="text-dim text-small" style={{ lineHeight: 1.7 }}>
            The MXE took two encrypted bucket states (yours and your match&apos;s
            {matchType === "cross" ? ", from two different organizations" : ""}) as input. It
            ran the IBS scoring circuit across MPC-secret-shared profile data — no Arx node ever
            saw the plaintext. It then revealed only the final score (a single u8) to both
            consenting users via a callback. Your genome stays encrypted forever.
          </p>
        </div>
      )}
    </>
  );
}

function StageDot({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="row mt-2">
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: active ? "var(--accent)" : "var(--text-faint)",
          boxShadow: active ? "0 0 12px var(--accent-glow)" : "none",
          animation: active ? "pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      <span className="text-small">{label}</span>
    </div>
  );
}
