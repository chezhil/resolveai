import type { Snapshot } from "../lib/api";
import { fmtTime, rupees } from "../lib/api";
import { usePinRequired } from "../lib/meta";
import { ApprovalCard } from "../components/CasePanel";
import { Empty, Pill, SectionLabel, StatusBadge } from "../components/ui";
import { ScenarioButtons } from "../components/ScenarioButtons";

/** Inbox for the humans in the loop: L2 approvals (two-person above ₹1 L) and ready handoffs. */
export function Approvals({ snap, open }: { snap: Snapshot; open: (id: string) => void }) {
  const pinRequired = usePinRequired();
  const pending = snap.approvals.filter((a) => a.status === "PENDING");
  const decided = snap.approvals.filter((a) => a.status !== "PENDING");
  const quarantined = snap.approvals.filter((a) => a.status === "QUARANTINED");
  const handoffs = snap.cases.filter((c) => c.caseFile);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <div className="card p-4">
          <div className="label text-muted">Human in the loop</div>
          <div className="font-display text-xl font-semibold">Approvals inbox · {pending.length} pending</div>
          <p className="mt-1 text-[12.5px] text-muted">
            The agent can't approve anything. L2 actions wait here; above ₹1,00,000 two different people must sign (P13).{" "}
            {pinRequired ? "Each approver signs with their own PIN, checked on the server." : "Approver identity is simulated on this server (no PINs set)."}
          </p>
          <div className="mt-2">
            <Pill tone={pinRequired ? "mint" : "sun"}>{pinRequired ? "PIN-verified approvers" : "Approver identity simulated"}</Pill>
          </div>
        </div>
        {pending.length ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {pending.map((a) => (
              <div key={a.id} className="min-w-0">
                <ApprovalCard a={a} />
                <button onClick={() => open(a.caseId)} className="mt-1 cursor-pointer px-1 text-[12px] font-semibold text-brand underline">
                  Open {a.caseId} in the live console
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty action={<ScenarioButtons items={[{ id: "B", label: "Run scenario B · needs two approvers" }]} />}>Nothing waiting. Higher-value actions (L2) land here for a human to sign.</Empty>
        )}
        {decided.length > 0 && (
          <div className="card p-3">
            <SectionLabel>Decided</SectionLabel>
            <div className="space-y-1">
              {decided.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                  <b className="font-mono">{a.id}</b>
                  <span>
                    {a.tool.replaceAll("_", " ")} {a.amount ? rupees(a.amount) : ""}
                  </span>
                  <Pill tone={a.status === "APPROVED" ? "mint" : "ember"}>{a.status.toLowerCase()}</Pill>
                  {a.status === "QUARANTINED" ? (
                    <span className="text-muted">
                      {a.quarantine?.changed.map((c) => `${c.label} is now ${c.now}`).join("; ")}
                      {a.quarantine ? ` · ${fmtTime(a.quarantine.at)}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted">
                      by {a.approvals.length > 1 ? a.approvals.map((x) => x.by).join(" + ") : a.decidedBy}
                      {a.decidedAt ? ` · ${fmtTime(a.decidedAt)}` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <SectionLabel>Human queue · ready handoffs</SectionLabel>
        {handoffs.length ? (
          handoffs.map((c) => (
            <button key={c.id} onClick={() => open(c.id)} className="card mb-2 block w-full cursor-pointer p-3 text-left">
              <div className="flex justify-between gap-2">
                <b className="font-mono text-xs">{c.id}</b>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-1 text-[13px] font-semibold">{c.caseFile!.reason}</div>
              <div className="text-[12px] text-muted">{c.caseFile!.recommendedAction}</div>
            </button>
          ))
        ) : (
          <Empty action={<ScenarioButtons items={[{ id: "D", label: "Run scenario D · payout-change attack" }]} />}>No escalations yet. Fraud signals and ambiguous cases arrive here with a full case file.</Empty>
        )}
      </div>
    </div>
  );
}
