import type { Snapshot } from "../lib/api";
import { fmtMs } from "../lib/api";
import { cx } from "./ui";

export function MetricsStrip({ snap }: { snap: Snapshot }) {
  const m = snap.metrics;
  const items = [
    ["Cases", m.cases, "bg-white"],
    ["Verified closed", m.resolved, "bg-mint"],
    ["Auto-resolved", m.cases ? `${Math.round(m.autoResolveRate * 100)}%` : "—", "bg-sun"],
    ["Watching money", m.watching, "bg-sun"],
    ["Awaiting approval", m.awaitingApproval, "bg-rose"],
    ["Escalated w/ case file", m.escalated, "bg-ember"],
    ["Proactive", m.proactive, "bg-sky"],
    ["Missed deadlines", m.missedDisputeDeadlines, "bg-white"],
    ["Merchant CSAT", m.csat ? `${m.csat}★` : "—", "bg-white"],
    ["First action p50 / p95", m.latency.firstActionP50 === null ? "—" : `${fmtMs(m.latency.firstActionP50)} / ${fmtMs(m.latency.firstActionP95)}`, "bg-sun"],
  ] as const;
  return (
    <div className="mb-4 grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2 xl:grid-cols-10">
      {items.map(([k, v, tone]) => (
        <div key={k} className={cx("min-w-0 rounded-xl border-2 border-ink px-2 py-1 sm:px-3 sm:py-1.5", tone)}>
          <div className="truncate font-display text-base font-extrabold leading-tight sm:text-xl">{v}</div>
          <div className="text-[10px] font-semibold leading-tight sm:text-[11px]">{k}</div>
        </div>
      ))}
    </div>
  );
}
