import type { Approval, Case } from "../lib/api";
import { rupees } from "../lib/api";

/**
 * What this case rests on, as a graph: confirmed facts (from tools only) feed the policy engine, which
 * produced each decision, which led to an outcome. When a fact behind a pending approval changes, the
 * affected facts, the approval and the decision turn coral and the approval is quarantined.
 */

const ROW = 62;
const CW = { facts: 196, hub: 128, dec: 196, out: 172 };
const X = { facts: 18, hub: 262, dec: 450, out: 676 };
const VERDICT: Record<string, string> = { ALLOW: "allowed", NEEDS_APPROVAL: "needs a human", BLOCK: "blocked", ESCALATE: "escalated", SHADOW: "shadow only" };

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function ProvenanceGraph({ kase, approvals }: { kase: Case; approvals: Approval[] }) {
  const mine = approvals.filter((a) => a.caseId === kase.id);
  const quarantined = mine.filter((a) => a.status === "QUARANTINED");
  const hotRrns = quarantined.flatMap((a) => (a.dependsOn ?? []).map((d) => d.label.match(/\d{12}/)?.[0]).filter(Boolean) as string[]);

  const facts = Object.values(kase.facts)
    .filter((f) => !f.key.startsWith("sop:"))
    .filter((f) => !(f.key.startsWith("txn:") && (f.value as { merchant_credit?: string })?.merchant_credit === "SUCCESS" && !hotRrns.includes(f.key.slice(4))));
  const shownFacts = facts.slice(0, 6);
  const moreFacts = facts.length - shownFacts.length;

  const decisions = kase.actions.slice(-6);
  const outcomes = [
    ...mine.map((a) => ({ id: a.id, title: `${a.tool.replaceAll("_", " ")} ${a.amount ? rupees(a.amount) : ""}`.trim(), sub: a.status.toLowerCase(), hot: a.status === "QUARANTINED", tool: a.tool })),
    { id: "case", title: `Case ${kase.status.toLowerCase().replaceAll("_", " ")}`, sub: kase.maxLevel, hot: kase.status === "ESCALATED" && quarantined.length > 0, tool: "" },
  ];

  const rows = Math.max(shownFacts.length + (moreFacts > 0 ? 1 : 0), decisions.length, outcomes.length, 3);
  const H = 56 + rows * ROW;
  const hubY = 56 + ((rows - 1) * ROW) / 2;
  const y = (i: number) => 56 + i * ROW;

  if (!facts.length && !decisions.length) {
    return <div className="rounded-[14px] border border-dashed border-line p-8 text-center text-sm text-muted">Facts appear here as the agent confirms them with tools.</div>;
  }

  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

  return (
    <div className="overflow-hidden rounded-[14px] bg-night text-fog">
      <div className="dotgrid px-2 pb-2 pt-3">
        <svg viewBox={`0 0 860 ${H}`} className="block h-auto w-full" role="img" aria-label="Provenance graph: facts, policy engine, decisions, outcomes">
          {[
            ["FACTS FROM TOOLS", X.facts],
            ["POLICY", X.hub],
            ["DECISIONS", X.dec],
            ["OUTCOME", X.out],
          ].map(([t, x]) => (
            <text key={String(t)} x={x as number} y={28} fontSize="10" letterSpacing="1.6" fill="#93a3a8" fontFamily="JetBrains Mono, monospace">
              {t}
            </text>
          ))}
          {shownFacts.map((f, i) => (
            <path key={f.key} d={curve(X.facts + CW.facts, y(i) + 24, X.hub, hubY + 24)} className={`glink ${f.key.startsWith("txn:") && hotRrns.includes(f.key.slice(4)) ? "hot" : ""}`} />
          ))}
          {decisions.map((d, i) => (
            <g key={`e${i}`}>
              <path d={curve(X.hub + CW.hub, hubY + 24, X.dec, y(i) + 24)} className="glink" />
              {outcomes
                .map((o, oi) => ({ o, oi }))
                .filter(({ o }) => o.tool && o.tool === d.tool)
                .map(({ o, oi }) => (
                  <path key={o.id} d={curve(X.dec + CW.dec, y(i) + 24, X.out, y(oi) + 24)} className={`glink ${o.hot ? "hot" : ""}`} />
                ))}
            </g>
          ))}

          {shownFacts.map((f, i) => {
            const hot = f.key.startsWith("txn:") && hotRrns.includes(f.key.slice(4));
            return (
              <g key={f.key} transform={`translate(${X.facts},${y(i)})`} className={`gnode ${hot ? "hot" : ""}`}>
                <rect width={CW.facts} height={48} rx={9} />
                <text x={10} y={20} fontSize="12">
                  {cut(f.key, 24)}
                </text>
                <text x={10} y={36} fontSize="10" className="sub">
                  {cut(f.source, 26)}
                </text>
              </g>
            );
          })}
          {moreFacts > 0 && (
            <text x={X.facts + 6} y={y(shownFacts.length) + 28} fontSize="11" fill="#93a3a8" fontFamily="JetBrains Mono, monospace">
              + {moreFacts} more facts
            </text>
          )}

          <g transform={`translate(${X.hub},${hubY})`} className="gnode focus">
            <rect width={CW.hub} height={48} rx={24} />
            <text x={CW.hub / 2} y={21} fontSize="12" textAnchor="middle">
              Policy engine
            </text>
            <text x={CW.hub / 2} y={37} fontSize="10" textAnchor="middle" className="sub">
              P0 to P14
            </text>
          </g>

          {decisions.map((d, i) => {
            const hot = quarantined.some((a) => a.tool === d.tool);
            return (
              <g key={`d${i}`} transform={`translate(${X.dec},${y(i)})`} className={`gnode ${hot ? "hot" : ""}`}>
                <rect width={CW.dec} height={48} rx={9} />
                <text x={10} y={20} fontSize="12">
                  {cut(d.tool.replaceAll("_", " "), 24)}
                </text>
                <text x={10} y={36} fontSize="10" className="sub">
                  {VERDICT[d.verdict] ?? d.verdict.toLowerCase()} · {d.level}
                </text>
              </g>
            );
          })}

          {outcomes.map((o, i) => (
            <g key={o.id} transform={`translate(${X.out},${y(i)})`} className={`gnode ${o.hot ? "hot" : ""}`}>
              <rect width={CW.out} height={48} rx={9} />
              <text x={10} y={20} fontSize="12">
                {cut(o.title, 22)}
              </text>
              <text x={10} y={36} fontSize="10" className="sub">
                {o.hot && o.tool ? "held, not executed" : o.sub}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-night-line px-4 py-2.5 font-mono text-[11.5px] text-fog-muted">
        <span>
          <b className="text-fog">{facts.length}</b> facts
        </span>
        <span>
          <b className="text-fog">{decisions.length}</b> decisions
        </span>
        <span className={quarantined.length ? "text-[#ffb09c]" : ""}>
          <b className={quarantined.length ? "text-[#ffd9d2]" : "text-fog"}>{quarantined.length}</b> quarantined
        </span>
        <span className="ml-auto">Facts come from tool output only. The model's claims never become facts.</span>
      </div>
    </div>
  );
}
