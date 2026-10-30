import { useState } from "react";
import type { Meta, Snapshot } from "../lib/api";
import { Pill, SectionLabel, cx } from "../components/ui";

const inr = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

export function Impact({ snap, meta }: { snap: Snapshot; meta: Meta | null }) {
  const [tickets, setTickets] = useState(1_000_000);
  const [rate, setRate] = useState(60);
  const [human, setHuman] = useState(45);
  const [ai, setAi] = useState(4);
  const saving = tickets * (rate / 100) * (human - ai);
  const m = snap.metrics;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card bg-ink p-5 text-white">
        <Pill tone="sky">Illustrative unit economics</Pill>
        <div className="mt-3 font-display text-2xl font-extrabold">Saving = tickets × auto-resolve rate × cost gap</div>
        <div className="mt-4 space-y-4">
          <Slider label="In-scope tickets / month" value={tickets} min={100_000} max={5_000_000} step={50_000} fmt={(v) => v.toLocaleString("en-IN")} onChange={setTickets} />
          <Slider label="Auto-resolve rate (pilot target)" value={rate} min={10} max={90} step={5} fmt={(v) => `${v}%`} onChange={setRate} />
          <Slider label="Human cost / ticket" value={human} min={10} max={150} step={1} fmt={(v) => `₹${v}`} onChange={setHuman} />
          <Slider label="ResolveAI cost / ticket" value={ai} min={1} max={20} step={0.5} fmt={(v) => `₹${v}`} onChange={setAi} />
        </div>
        <div className="mt-5 rounded-2xl border-2 border-white bg-sun p-4 text-ink">
          <div className="font-display text-4xl font-extrabold tracking-tight">{inr(saving)} / month</div>
          <div className="text-[13px] font-semibold">before retention and recovery upside</div>
        </div>
        <p className="mt-3 text-[11.5px] text-white/60">All inputs are assumptions to be replaced with Paytm baseline data in a 30-day shadow pilot.</p>
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <SectionLabel>Live from this session</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Tile tone="bg-sun" big={m.cases ? `${Math.round(m.autoResolveRate * 100)}%` : "—"} label="closed without human touch" />
            <Tile tone="bg-sky" big={m.medianMinutesToResolve !== null ? fmtMin(m.medianMinutesToResolve) : "—"} label="median time to verified close" />
            <Tile tone="bg-rose" big={String(m.proactive)} label="cases opened before a complaint" />
            <Tile tone="bg-mint" big={String(m.missedDisputeDeadlines)} label="missed dispute deadlines" />
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {m.cases} cases · {m.resolved} verified closed · {m.escalated} escalated with case file · {m.awaitingApproval} awaiting approval
          </div>
        </div>
        <div className="card p-4">
          <SectionLabel>Earn trust in stages</SectionLabel>
          {[
            ["Days 0–30", "Shadow mode", "Workflow A on live events, no actions. Compare with human outcomes, tune the policy engine.", "bg-sun"],
            ["Days 30–60", "Assisted", "Case files and drafts for agents, one-click L2 approvals, regional-language voice.", "bg-sky"],
            ["Days 60–90", "Autonomous L1", "Auto-resolve low-risk cases. Add settlement and dispute flows.", "bg-ember"],
          ].map(([d, t, s, tone]) => (
            <div key={t} className="mb-2 flex gap-3">
              <span className={cx("label h-fit shrink-0 rounded-full border-2 border-ink px-2 py-0.5", tone)}>{d}</span>
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-[12.5px] text-muted">{s}</div>
              </div>
            </div>
          ))}
        </div>
        {meta && (
          <div className="card p-4">
            <SectionLabel>Policy rules enforced in code</SectionLabel>
            {Object.entries(meta.rules).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[12.5px]">
                <span className="w-7 shrink-0 font-mono font-bold">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const fmtMin = (m: number) => (m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`);

function Tile({ big, label, tone }: { big: string; label: string; tone: string }) {
  return (
    <div className={cx("rounded-xl border-2 border-ink p-3", tone)}>
      <div className="font-display text-3xl font-extrabold">{big}</div>
      <div className="text-[12px] font-semibold leading-tight">{label}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="font-mono font-bold text-sun">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#ffd640]" />
    </label>
  );
}
