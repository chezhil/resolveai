import type { Meta, Snapshot, TraceEvent } from "../lib/api";
import { api } from "../lib/api";
import { Trace } from "../components/Trace";
import { CasePanel } from "../components/CasePanel";
import { DemoGuide } from "../components/DemoGuide";
import { AppLink } from "../components/AppLink";
import { Button, Pill, SectionLabel, cx } from "../components/ui";

const TAG_TONE: Record<string, string> = { A: "bg-sun", B: "bg-sky", C: "bg-rose", D: "bg-ember", E: "bg-mint", F: "bg-peach", G: "bg-sun" };

interface Props {
  snap: Snapshot;
  meta: Meta | null;
  traces: Record<string, TraceEvent[]>;
  selected?: string;
  select: (id: string) => void;
}

/** Live console: the agent trace is the hero; scenarios and the guided demo on the left, case file on the right. */
export function Console({ snap, meta, traces, selected, select }: Props) {
  const kase = snap.cases.find((c) => c.id === selected) ?? snap.cases[0];
  const lastMsg = kase ? [...snap.messages].reverse().find((m) => m.caseId === kase.id) : undefined;
  const run = (id: string) => api(`/scenarios/${id}`, {});

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      {/* Demo controls */}
      <div className="min-w-0 space-y-3">
        <DemoGuide snap={snap} />
        <div className="card p-3">
          <SectionLabel>Demo scenarios</SectionLabel>
          <div className="grid gap-1.5">
            {meta?.scenarios.map((s) => {
              const done = snap.cases.some((c) => c.inbound === s.text || (s.id === "E" && c.proactive));
              return (
                <button
                  key={s.id}
                  onClick={() => run(s.id)}
                  className="group flex cursor-pointer items-start gap-2 rounded-[10px] border border-line bg-white p-2 text-left transition-transform hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line font-display font-semibold", TAG_TONE[s.id])}>{s.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight">{s.title}</span>
                    <span className="block truncate text-[11px] text-muted">{s.tag}</span>
                  </span>
                  {done && <span className="text-xs text-mint">●</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">Then use the clock to jump ahead: watchers wake the agent when money moves.</p>
        </div>

        <AppLink to="/merchant" className="card flex items-center gap-3 p-3 transition-transform hover:-translate-y-0.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-mint text-lg" aria-hidden>
            📱
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">Merchant phone view</span>
            <span className="block truncate text-[11.5px] text-muted">{lastMsg ? `Last: ${lastMsg.gloss ?? lastMsg.text}` : "WhatsApp, voice notes, soundbox and payer phone"}</span>
          </span>
        </AppLink>
      </div>

      {/* Trace */}
      <div className="card min-h-[520px] min-w-0 p-4 lg:min-h-[640px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="label text-muted">Agent trace · Hear → Plan → Check → Act → Verify</div>
            <div className="font-display text-xl font-semibold">
              {kase ? `${snap.merchants.find((m) => m.id === kase.merchantId)?.business} · ${kase.id}` : "Waiting for a signal"}
            </div>
          </div>
          {snap.cases.length > 1 && (
            <select value={kase?.id} onChange={(e) => select(e.target.value)} className="chunky rounded-lg bg-white px-2 py-1 text-sm">
              {snap.cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.workflow} · {c.status}
                </option>
              ))}
            </select>
          )}
        </div>
        {kase && (
          <div className="mb-3 rounded-[10px] bg-cream px-3 py-2 text-[12.5px]">
            <span className="label text-muted">What the model sees (PII redacted) · </span>
            <span className="font-mono">{kase.inboundRedacted}</span>
          </div>
        )}
        <Trace kase={kase} events={kase ? (traces[kase.id] ?? []) : []} />
        {kase && ["WATCHING", "AWAITING_APPROVAL"].includes(kase.status) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line p-3 text-sm">
            {kase.status === "WATCHING" ? (
              <>
                <span>Agent is waiting on the counterparty. Jump the clock to let the money move:</span>
                <Button tone="sun" size="sm" onClick={() => api("/clock/advance", { minutes: 180 })}>
                  +3 hours
                </Button>
                <Button tone="sun" size="sm" onClick={() => api("/clock/advance", { minutes: 24 * 60 })}>
                  Next morning
                </Button>
              </>
            ) : (
              <span>
                Paused for a human: approve or reject in the case file, or in the{" "}
                <AppLink to="/approvals" className="font-semibold text-brand underline">
                  approvals inbox
                </AppLink>
                .
              </span>
            )}
          </div>
        )}
      </div>

      {/* Case file */}
      <div className="min-w-0 lg:col-start-2 2xl:col-start-auto">
        <CasePanel kase={kase} approvals={snap.approvals} watchers={snap.watchers} />
        {snap.upcoming.length > 0 && (
          <div className="card mt-3 p-3">
            <SectionLabel>Upcoming in the simulated world</SectionLabel>
            {snap.upcoming.slice(0, 4).map((u, i) => (
              <div key={i} className="flex justify-between gap-2 text-[12px]">
                <span className="truncate">{u.label}</span>
                <Pill>{new Date(u.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
