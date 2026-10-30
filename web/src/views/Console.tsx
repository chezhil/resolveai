import { useEffect, useState } from "react";
import type { Announcement, Meta, Snapshot, TraceEvent } from "../lib/api";
import { api } from "../lib/api";
import { Trace } from "../components/Trace";
import { CasePanel } from "../components/CasePanel";
import { DemoGuide } from "../components/DemoGuide";
import { PayerPhone, Phone, Soundbox } from "../components/Phone";
import { Button, Pill, SectionLabel, cx } from "../components/ui";

const TAG_TONE: Record<string, string> = { A: "bg-sun", B: "bg-sky", C: "bg-rose", D: "bg-ember", E: "bg-mint", F: "bg-peach", G: "bg-sun" };

interface Props {
  snap: Snapshot;
  meta: Meta | null;
  traces: Record<string, TraceEvent[]>;
  live: Announcement | null;
  selected?: string;
  select: (id: string) => void;
}

export function Console({ snap, meta, traces, live, selected, select }: Props) {
  const [merchantId, setMerchantId] = useState("M1001");
  const kase = snap.cases.find((c) => c.id === selected) ?? snap.cases[0];

  // Follow the newest case as it opens.
  const newest = snap.cases[0]?.id;
  useEffect(() => {
    if (newest) select(newest);
  }, [newest]);
  useEffect(() => {
    if (kase) setMerchantId(kase.merchantId);
  }, [kase?.id]);

  const merchant = snap.merchants.find((m) => m.id === merchantId);
  const msgs = snap.messages.filter((m) => snap.cases.find((c) => c.id === m.caseId)?.merchantId === merchantId);

  const run = async (id: string, mId: string) => {
    setMerchantId(mId);
    await api(`/scenarios/${id}`, {});
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
      {/* Channels */}
      <div className="space-y-3">
        <DemoGuide snap={snap} />
        <div className="card p-3">
          <SectionLabel>Demo scenarios</SectionLabel>
          <div className="grid gap-1.5">
            {meta?.scenarios.map((s) => {
              const done = snap.cases.some((c) => c.inbound === s.text || (s.id === "E" && c.proactive));
              return (
                <button
                  key={s.id}
                  onClick={() => run(s.id, s.merchantId)}
                  className="group flex cursor-pointer items-start gap-2 rounded-xl border-2 border-ink bg-white p-2 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#121633]"
                >
                  <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-ink font-display font-extrabold", TAG_TONE[s.id])}>{s.id}</span>
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

        <div className="flex flex-wrap gap-1">
          {snap.merchants.map((m) => (
            <button
              key={m.id}
              onClick={() => setMerchantId(m.id)}
              className={cx("label cursor-pointer rounded-full border-2 border-ink px-2 py-0.5", m.id === merchantId ? "bg-ink text-white" : "bg-white")}
            >
              {m.owner.split(" ")[0]}
            </button>
          ))}
        </div>
        <Phone merchant={merchant} messages={msgs} cases={snap.cases} sarvam={!!meta?.voice.sarvam} onSent={select} />
        <Soundbox merchant={merchant} announcements={snap.announcements} live={live} sarvam={!!meta?.voice.sarvam} />
        <PayerPhone messages={msgs} />
        {meta?.whatsapp.enabled && (
          <div className="card bg-[#d9fdd3] p-3 text-[12.5px]">
            <div className="label mb-1 text-muted">Live WhatsApp channel</div>
            Message <b>{meta.whatsapp.number}</b>
            {meta.whatsapp.joinCode && (
              <>
                {" "}
                with <b className="font-mono">{meta.whatsapp.joinCode}</b> first
              </>
            )}
            , then open{" "}
            <a className="font-semibold text-brand underline" href={`?room=${meta.whatsapp.room}`}>
              the WhatsApp room
            </a>{" "}
            to watch your case. You play {snap.merchants.find((m) => m.id === "M1001")?.owner}.
          </div>
        )}
      </div>

      {/* Trace */}
      <div className="card min-h-[640px] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="label text-muted">Agent trace · Hear → Plan → Check → Act → Verify</div>
            <div className="font-display text-xl font-extrabold">
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
          <div className="mb-3 rounded-xl bg-cream px-3 py-2 text-[12.5px]">
            <span className="label text-muted">What the model sees (PII redacted) · </span>
            <span className="font-mono">{kase.inboundRedacted}</span>
          </div>
        )}
        <Trace kase={kase} events={kase ? (traces[kase.id] ?? []) : []} />
        {kase && ["WATCHING", "AWAITING_APPROVAL"].includes(kase.status) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-ink/40 p-3 text-sm">
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
              <span>Paused for a human: approve or reject in the case file →</span>
            )}
          </div>
        )}
      </div>

      {/* Case file */}
      <div>
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
