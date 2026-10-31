import { useEffect, useState } from "react";
import type { Announcement, Meta, Snapshot } from "../lib/api";
import { api } from "../lib/api";
import { PayerPhone, Phone, Soundbox } from "../components/Phone";
import { useAppNavigate } from "../components/AppLink";
import { Pill, SectionLabel, StatusBadge, cx } from "../components/ui";

interface Props {
  snap: Snapshot;
  meta: Meta | null;
  live: Announcement | null;
  selected?: string;
  select: (id: string) => void;
}

/** What the merchant (and the paying customer) see: WhatsApp thread, voice, soundbox. */
export function Merchant({ snap, meta, live, selected, select }: Props) {
  const go = useAppNavigate();
  const selectedCase = snap.cases.find((c) => c.id === selected);
  const [merchantId, setMerchantId] = useState(selectedCase?.merchantId ?? snap.cases[0]?.merchantId ?? "M1001");
  useEffect(() => {
    if (selectedCase) setMerchantId(selectedCase.merchantId);
  }, [selectedCase?.id]);

  const merchant = snap.merchants.find((m) => m.id === merchantId);
  const theirCases = snap.cases.filter((c) => c.merchantId === merchantId);
  const msgs = snap.messages.filter((m) => theirCases.some((c) => c.id === m.caseId));
  const scenarios = meta?.scenarios.filter((s) => s.merchantId === merchantId) ?? [];

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Merchant">
          {snap.merchants.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === merchantId}
              onClick={() => setMerchantId(m.id)}
              className={cx("label cursor-pointer rounded-full border border-line px-2.5 py-1", m.id === merchantId ? "bg-ink text-white" : "bg-white")}
            >
              {m.owner.split(" ")[0]}
            </button>
          ))}
        </div>
        <Phone merchant={merchant} messages={msgs} cases={snap.cases} sarvam={!!meta?.voice.sarvam} onSent={select} />
      </div>

      <div className="min-w-0 space-y-3">
        {merchant && (
          <div className="card p-3">
            <SectionLabel right={<Pill tone="sky">{merchant.lang === "kn" ? "Kannada" : merchant.lang === "hi" ? "Hindi" : "English"}</Pill>}>{merchant.id}</SectionLabel>
            <div className="font-display text-lg font-semibold leading-tight">{merchant.business}</div>
            <div className="text-[12.5px] text-muted">
              {merchant.owner} · {merchant.area}
            </div>
            {scenarios.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => api(`/scenarios/${s.id}`, {})}
                    className="chunky cursor-pointer rounded-[10px] bg-sun px-2.5 py-1 text-left text-[12px] font-semibold"
                  >
                    {s.id} · {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Soundbox merchant={merchant} announcements={snap.announcements} live={live} sarvam={!!meta?.voice.sarvam} />
        <PayerPhone messages={msgs} />
        {theirCases.length > 0 && (
          <div className="card p-3">
            <SectionLabel>Cases for this merchant</SectionLabel>
            <div className="space-y-1.5">
              {theirCases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    select(c.id);
                    go("/");
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-[12.5px] hover:bg-sun/20"
                >
                  <span className="min-w-0 truncate">
                    <b className="font-mono">{c.id}</b> · {c.workflow.replace("_", " ")}
                  </span>
                  <StatusBadge status={c.status} />
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">Open a case to watch the agent's trace in the live console.</p>
          </div>
        )}
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
            <a className="font-semibold text-brand underline" href={`/merchant?room=${meta.whatsapp.room}`}>
              the WhatsApp room
            </a>{" "}
            to watch your case. You play {snap.merchants.find((m) => m.id === "M1001")?.owner}.
          </div>
        )}
      </div>
    </div>
  );
}
