import { useState } from "react";
import type { Approval, Case, Level, Watcher } from "../lib/api";
import { api, fmtMs, fmtTime, rupees } from "../lib/api";
import { Button, Empty, LEVEL_NAME, Pill, SectionLabel, StatusBadge, cx } from "./ui";

const LEVELS: Level[] = ["L0", "L1", "L2", "L3"];
const RANK: Record<Level, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
const LEVEL_BG: Record<Level, string> = { L0: "bg-sun", L1: "bg-sky", L2: "bg-rose", L3: "bg-ember" };

export function CasePanel({ kase, approvals, watchers }: { kase?: Case; approvals: Approval[]; watchers: Watcher[] }) {
  if (!kase) return <Empty>The case file builds here as the agent works.</Empty>;
  const pending = approvals.filter((a) => a.caseId === kase.id && a.status === "PENDING");
  const mine = watchers.filter((w) => w.caseId === kase.id);
  const all = Object.values(kase.facts).filter((f) => !f.key.startsWith("sop:"));
  // Healthy payments the agent ruled out are noise in the case file; count them instead.
  const healthy = all.filter((f) => f.key.startsWith("txn:") && (f.value as any)?.merchant_credit === "SUCCESS");
  const facts = all.filter((f) => !healthy.includes(f));
  const sops = Object.values(kase.facts).filter((f) => f.key.startsWith("sop:"));

  return (
    <div className="space-y-3">
      <div className="card p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-mono text-xs font-bold text-muted">{kase.id}</div>
            <div className="font-display text-lg font-extrabold capitalize leading-tight">{kase.workflow.replace("_", " ")}</div>
          </div>
          <StatusBadge status={kase.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {kase.proactive && <Pill tone="sky">Proactive</Pill>}
          {kase.shadow && <Pill>Shadow</Pill>}
          <Pill>{kase.lang === "kn" ? "Kannada" : kase.lang === "hi" ? "Hindi" : "English"}</Pill>
          <Pill>{kase.brain === "llm" ? "Groq/Gemini" : "Planner"}</Pill>
          {kase.pii && kase.pii.items > 0 && (
            <Pill tone={kase.pii.shredded ? "white" : "sky"}>{kase.pii.shredded ? `🔒 ${kase.pii.items} PII · shredded` : `🔒 ${kase.pii.items} PII · ${kase.pii.cipher}`}</Pill>
          )}
          {kase.timing.firstActionMs !== undefined && <Pill tone="sun">⚡ first action {fmtMs(kase.timing.firstActionMs)}</Pill>}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {LEVELS.map((l) => (
            <div
              key={l}
              title={LEVEL_NAME[l]}
              className={cx(
                "rounded-lg border-2 border-ink px-1 py-1 text-center transition-all",
                RANK[l] <= RANK[kase.maxLevel] ? LEVEL_BG[l] : "bg-white opacity-35",
                l === kase.maxLevel && "shadow-[2px_2px_0_#121633]",
              )}
            >
              <div className="font-display text-base font-extrabold leading-none">{l}</div>
              <div className="mt-0.5 text-[9px] font-semibold leading-tight">{LEVEL_NAME[l]}</div>
            </div>
          ))}
        </div>
        {(kase.rootCause || kase.summary) && (
          <div className="mt-3 rounded-lg bg-cream p-2 text-[12.5px]">
            {kase.rootCause && (
              <div>
                <b>Root cause:</b> {kase.rootCause}
              </div>
            )}
            {kase.summary && (
              <div className="mt-1">
                <b>Resolution:</b> {kase.summary}
              </div>
            )}
          </div>
        )}
      </div>

      {pending.map((a) => (
        <ApprovalCard key={a.id} a={a} />
      ))}

      {kase.caseFile && (
        <div className="card border-ember p-3">
          <SectionLabel right={<Pill tone="ember">{kase.caseFile.severity}</Pill>}>Case file for human</SectionLabel>
          <div className="text-[13px] font-semibold">{kase.caseFile.reason}</div>
          <div className="mt-1 text-[12.5px]">
            <b>Recommended:</b> {kase.caseFile.recommendedAction}
          </div>
          <ul className="mt-1.5 list-disc pl-4 text-[12px] text-muted">
            {kase.caseFile.stepsTaken.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div className="mt-1.5 text-[11px] text-muted">{kase.caseFile.evidence.length} evidence items attached · customer will not be re-asked</div>
        </div>
      )}

      <div className="card p-3">
        <SectionLabel right={<span className="text-[11px] text-muted">from tools only</span>}>Confirmed facts</SectionLabel>
        {facts.length === 0 && <div className="text-xs text-muted">None yet</div>}
        <ul className="space-y-1">
          {facts.map((f) => (
            <li key={f.key} className="flex gap-1.5 text-[12px]">
              <span className="text-mint">✓</span>
              <span className="min-w-0">
                <span className="font-mono font-bold">{f.key}</span> <span className="break-all text-muted">{short(f.value)}</span>
                <span className="ml-1 rounded bg-sand px-1 font-mono text-[10px]">{f.source}</span>
              </span>
            </li>
          ))}
        </ul>
        {healthy.length > 0 && <div className="mt-1 text-[11.5px] text-muted">+ {healthy.length} healthy payments checked and ruled out</div>}
        {sops.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sops.map((s) => (
              <span key={s.key} className="rounded bg-sky/25 px-1.5 py-0.5 font-mono text-[10px]" title={String(s.value)}>
                {s.key.slice(4)}
              </span>
            ))}
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <div className="card p-3">
          <SectionLabel>Watchers</SectionLabel>
          {mine.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span>
                <b>{w.kind}</b> {w.ref}
                <span className="block text-[11px] text-muted">escalate if not done by {fmtTime(w.deadline)}</span>
              </span>
              <Pill tone={w.status === "FIRED" ? "mint" : w.status === "BREACHED" ? "ember" : w.status === "ACTIVE" ? "sun" : "white"}>{w.status}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const APPROVERS = [
  { id: "ops-lead", label: "Ops lead" },
  { id: "risk-lead", label: "Risk lead" },
];

export function ApprovalCard({ a }: { a: Approval }) {
  const [err, setErr] = useState("");
  const act = (decision: "APPROVED" | "REJECTED", by: string) => api(`/approvals/${a.id}`, { decision, by }).catch((e) => setErr((e as Error).message));
  const signed = new Set(a.approvals.map((x) => x.by));
  return (
    <div className="card rise bg-rose/30 p-3">
      <SectionLabel right={<Pill tone="rose">L2{a.required > 1 ? " · two-person" : ""}</Pill>}>One-click approval · {a.id}</SectionLabel>
      <div className="font-display text-lg font-extrabold">
        {a.tool.replaceAll("_", " ")} {a.amount ? rupees(a.amount) : ""}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">{a.rationale}</div>
      <div className="mt-1 break-all font-mono text-[11px]">{JSON.stringify(a.input)}</div>
      {a.required > 1 && (
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <span className="font-semibold">
            Signatures {a.approvals.length}/{a.required}
          </span>
          {a.approvals.map((x) => (
            <Pill key={x.by} tone="mint">
              ✓ {x.by}
            </Pill>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(a.required > 1 ? APPROVERS : APPROVERS.slice(0, 1)).map((p) => (
          <Button key={p.id} tone="mint" disabled={signed.has(p.id)} onClick={() => act("APPROVED", p.id)}>
            {a.required > 1 ? `Approve as ${p.label}` : "Approve"}
          </Button>
        ))}
        <Button tone="white" onClick={() => act("REJECTED", "ops-lead")}>
          Reject
        </Button>
      </div>
      {err && <div className="mt-2 text-[12px] text-ember">{err}</div>}
    </div>
  );
}

function short(v: unknown) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 88) + "…" : s;
}
