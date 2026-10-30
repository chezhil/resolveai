import { useState } from "react";
import type { Case, TraceEvent } from "../lib/api";
import { fmtMs, fmtTPlus } from "../lib/api";
import { Empty, Json, LevelBadge, Pill, StageChip, cx } from "./ui";

const VERDICT_TONE = { ALLOW: "mint", SHADOW: "white", NEEDS_APPROVAL: "rose", BLOCK: "ember", ESCALATE: "ember" } as const;

export function Trace({ kase, events }: { kase?: Case; events: TraceEvent[] }) {
  if (!kase) return <Empty>Run a scenario or send a merchant message to watch the agent work.</Empty>;

  return (
    <ol className="relative space-y-2.5">
      <div className="absolute top-2 bottom-2 left-[37px] w-0.5 bg-ink/15" aria-hidden />
      {merge(events).map((e) => (
        <Row key={e.id} e={e} />
      ))}
    </ol>
  );
}

/** Fold an allowed policy CHECK into the ACT row that follows it, so each action reads as one step. */
function merge(events: TraceEvent[]) {
  const out: TraceEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const next = events[i + 1];
    if (e.stage === "CHECK" && e.decision?.verdict === "ALLOW" && next?.stage === "ACT" && next.tool === e.tool) {
      out.push({ ...next, decision: e.decision, level: e.level });
      i++;
    } else out.push(e);
  }
  return out;
}

function Row({ e }: { e: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const hasBody = e.input !== undefined || e.output !== undefined;
  return (
    <li className="rise relative flex gap-3">
      <div className="z-10 flex w-[76px] shrink-0 flex-col items-center gap-1 pt-0.5">
        <StageChip stage={e.stage} />
        <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{fmtTPlus(e.tPlus)}</span>
      </div>
      <div className={cx("min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-3 py-2", e.stage === "HANDOFF" && "bg-brand/5", e.stage === "VERIFY" && "bg-mint/10")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-[13.5px] font-semibold leading-snug">{e.title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {e.ms !== undefined && <span className="font-mono text-[10px] text-muted" title="Compute time for this step (excludes demo pacing)">⚡{fmtMs(e.ms)}</span>}
            {e.decision && <Pill tone={VERDICT_TONE[e.decision.verdict]}>{e.decision.verdict.replace("_", " ")}</Pill>}
            <LevelBadge level={e.level} />
          </div>
        </div>
        {e.detail && <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{e.detail}</p>}
        {e.decision && (
          <div className="mt-1.5 rounded-lg bg-cream px-2 py-1.5 text-[12px]">
            <span className="font-mono text-[11px] font-bold">{e.decision.rules.join(" · ")}</span>
            <span className="text-muted"> — {e.decision.reasons.join("; ")}</span>
          </div>
        )}
        {hasBody && (
          <button className="label mt-1.5 cursor-pointer text-brand" onClick={() => setOpen(!open)}>
            {open ? "▾ hide" : "▸"} {e.tool ?? "data"}
          </button>
        )}
        {open && (
          <div className="mt-1.5 grid gap-1.5">
            {e.input !== undefined && <Json value={{ input: e.input }} />}
            {e.output !== undefined && <Json value={{ output: e.output }} />}
          </div>
        )}
      </div>
    </li>
  );
}
