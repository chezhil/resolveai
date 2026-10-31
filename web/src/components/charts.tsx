// Chart primitives in the console's paper-and-ink language: hairline frames, one mint accent for the agent, grey for the
// human baseline, coral for harm. Hand-drawn SVG and CSS bars (no chart library), every chart carries a text alternative.

import type { ReactNode } from "react";
import { cx } from "./ui";

export const INK = "var(--color-ink)";
export const MINT = "var(--color-mintfill)";
export const MINT_DEEP = "var(--color-ok)";
export const GREY = "#98a29b";
export const GREY_SOFT = "var(--color-paper-3)";
export const CORAL = "var(--color-redfill)";
export const SKY = "#8fbfe8";
export const SUN = "#e8cf6a";
const GRID = "var(--color-line)";

export function ChartCard({ kicker, title, note, children, className, right }: { kicker: string; title: ReactNode; note?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cx("card flex min-w-0 flex-col p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label text-muted">{kicker}</div>
          <h3 className="mt-0.5 font-display text-[19px] font-semibold leading-tight tracking-tight">{title}</h3>
        </div>
        {right}
      </header>
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
      {note && <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-snug text-muted">{note}</p>}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; hollow?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-text-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border" style={{ background: i.hollow ? "transparent" : i.color, borderColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** A big number with a caption, for the headline band. */
export function Stat({ big, label, sub, tone = "white" }: { big: ReactNode; label: string; sub?: ReactNode; tone?: "white" | "mint" | "ink" | "sun" | "rose" | "sky" }) {
  const T = { white: "bg-white", mint: "bg-mint", ink: "bg-ink text-white", sun: "bg-sun", rose: "bg-rose", sky: "bg-sky" } as const;
  return (
    <div className={cx("rounded-[16px] border border-line p-4", T[tone])}>
      <div className="font-display text-[40px] font-semibold leading-none tracking-tight sm:text-[46px]">{big}</div>
      <div className={cx("mt-2 text-[13px] font-bold leading-tight", tone === "ink" && "text-white")}>{label}</div>
      {sub && <div className={cx("mt-1 text-[12px] leading-snug", tone === "ink" ? "text-white/65" : tone === "white" ? "text-muted" : "text-text-2")}>{sub}</div>}
    </div>
  );
}

/** Two bars per row, e.g. agent vs human, with the counts written out. */
export function PairBars({ rows, aName, bName, aColor = MINT, bColor = GREY }: { rows: { label: string; a: number; b: number; of: number }[]; aName: string; bName: string; aColor?: string; bColor?: string }) {
  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: aName, color: aColor },
            { label: bName, color: bColor },
          ]}
        />
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-bold">{r.label}</span>
              <span className="font-mono text-[11px] text-muted">{r.of} ticket{r.of === 1 ? "" : "s"}</span>
            </div>
            {[
              [aName, r.a, aColor],
              [bName, r.b, bColor],
            ].map(([n, v, c]) => (
              <div key={String(n)} className="flex items-center gap-2" title={`${n}: ${v} of ${r.of} correct`}>
                <div className="h-[9px] flex-1 overflow-hidden rounded-full" style={{ background: GREY_SOFT }}>
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${r.of ? (Number(v) / r.of) * 100 : 0}%`, background: String(c) }} />
                </div>
                <span className="w-9 text-right font-mono text-[11.5px] font-bold">
                  {String(v)}/{r.of}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for a single series, with an optional highlight colour per row. */
export function HBars({ rows, max, unit = "" }: { rows: { label: string; value: number; color?: string; note?: string }[]; max?: number; unit?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2.5 text-[13px]">
          <span className="truncate font-semibold" title={r.label}>
            {r.label}
          </span>
          <div className="h-[10px] overflow-hidden rounded-full" style={{ background: GREY_SOFT }}>
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(r.value / top) * 100}%`, background: r.color ?? MINT }} />
          </div>
          <span className="font-mono text-[12px] font-bold">
            {r.value}
            {unit}
            {r.note && <span className="ml-1 font-normal text-muted">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Pass rate per group: filled part is passed, the rest is what failed. */
export function PassBars({ rows }: { rows: { label: string; passed: number; total: number; accent?: boolean }[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const ok = r.passed === r.total;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="font-bold">{r.label}</span>
              <span className={cx("font-mono text-[12px] font-bold", ok ? "text-ok" : "text-bad")}>
                {r.passed}/{r.total} {ok ? "pass" : "FAIL"}
              </span>
            </div>
            <div className="flex h-[10px] gap-[3px]" role="img" aria-label={`${r.label}: ${r.passed} of ${r.total} cases pass`}>
              {Array.from({ length: r.total }).map((_, i) => (
                <span key={i} className="h-full flex-1 rounded-[3px]" style={{ background: i < r.passed ? (r.accent ? INK : MINT) : CORAL }} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, big, small, label, size = 168 }: { slices: Slice[]; big: ReactNode; small: string; label: string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 62;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={`${label}: ${slices.filter((s) => s.value).map((s) => `${s.label} ${s.value}`).join(", ") || "no data"}`} className="shrink-0">
        <circle cx="80" cy="80" r={r} fill="none" stroke={GREY_SOFT} strokeWidth="20" />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * circ;
              const el = <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={`${Math.max(0, len - 2)} ${circ}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
              offset += len;
              return el;
            })}
        <text x="80" y="82" textAnchor="middle" fontSize="30" fontWeight="700" fill={INK} style={{ fontFamily: "var(--font-display)" }}>
          {big}
        </text>
        <text x="80" y="102" textAnchor="middle" fontSize="9.5" fill="#5d6975" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {small}
        </text>
      </svg>
      <ul className="min-w-[11rem] flex-1 space-y-1.5 text-[13px]">
        {slices.map((s) => (
          <li key={s.label} className={cx("flex items-center justify-between gap-3", !s.value && "opacity-45")}>
            <span className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-mono text-[12px] font-bold">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A duration a person would say out loud, rounded: "25 min", "1.5 h", "1.8 d". */
export const fmtDur = (min: number) =>
  min < 1 ? `${Math.max(1, Math.round(min * 60))} s` : min < 90 ? `${Math.round(min)} min` : min < 2880 ? `${(min / 60).toFixed(min < 600 ? 1 : 0)} h` : `${(min / 1440).toFixed(1)} d`;

const fmtTick = (min: number) => (min < 1 ? `${Math.round(min * 60)} s` : min < 60 ? `${min} min` : min < 1440 ? `${min / 60} h` : `${min / 1440} d`);

/**
 * One row per ticket: the human's time to a decision against the agent's, on a log axis because the two differ by orders of magnitude.
 * A coral ring marks a ticket where the human's action was wrong.
 */
export function Dumbbell({ rows }: { rows: { id: string; label: string; human: number; agent: number; humanWrong: boolean }[] }) {
  const W = 760;
  const rowH = 30;
  const left = 150;
  const right = 70;
  const top = 26;
  const H = top + rows.length * rowH + 26;
  const lo = Math.log10(0.1);
  const hi = Math.log10(6000);
  const x = (m: number) => left + ((Math.log10(Math.max(m, 0.1)) - lo) / (hi - lo)) * (W - left - right);
  const ticks = [0.1667, 1, 10, 60, 360, 1440, 4320];
  const summary = rows.map((r) => `${r.id} ${r.label}: human ${fmtDur(r.human)}, agent ${fmtDur(r.agent)}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Time to a decision per ticket, human against agent, log scale. ${summary}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 8} y2={H - 22} stroke={GRID} strokeDasharray="2 4" />
          <text x={x(t)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#5d6975" style={{ fontFamily: "var(--font-mono)" }}>
            {t < 1 ? "10 s" : fmtTick(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rowH + rowH / 2;
        return (
          <g key={r.id}>
            <title>{`${r.id} · ${r.label}: human ${fmtDur(r.human)}, agent ${fmtDur(r.agent)}${r.humanWrong ? " · the human's action was wrong" : ""}`}</title>
            <text x="0" y={y + 4} fontSize="11.5" fontWeight="700" fill={INK} style={{ fontFamily: "var(--font-mono)" }}>
              {r.id}
            </text>
            <text x="48" y={y + 4} fontSize="11.5" fill="#46525e">
              {r.label.length > 16 ? `${r.label.slice(0, 15)}…` : r.label}
            </text>
            <line x1={x(r.agent)} x2={x(r.human)} y1={y} y2={y} stroke={GREY} strokeWidth="2" />
            <circle cx={x(r.human)} cy={y} r="6" fill={GREY} stroke={r.humanWrong ? CORAL : "none"} strokeWidth="3" />
            <circle cx={x(r.agent)} cy={y} r="6" fill={MINT} stroke={INK} strokeWidth="1.5" />
            <text x={W} y={y + 4} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#46525e" style={{ fontFamily: "var(--font-mono)" }}>
              {fmtDur(r.human)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One thin bar per case, sorted, so the shape of a distribution (not just its percentiles) is visible. */
export function MiniBars({ values, color = MINT, unit = "ms", label }: { values: number[]; color?: string; unit?: string; label: string }) {
  const v = [...values].sort((a, b) => a - b);
  const top = Math.max(1, ...v);
  const W = 320;
  const H = 74;
  const gap = 2;
  const bw = v.length ? (W - gap * (v.length - 1)) / v.length : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label={`${label}: ${v.length} values from ${v[0] ?? 0} to ${v[v.length - 1] ?? 0} ${unit}`}>
      {v.map((x, i) => {
        const h = Math.max(2, (x / top) * H);
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="1.5" fill={i === v.length - 1 ? INK : color}><title>{`${Math.round(x)} ${unit}`}</title></rect>;
      })}
      <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke={GRID} />
      <text x="0" y={H + 13} fontSize="10" fill="#5d6975" style={{ fontFamily: "var(--font-mono)" }}>fastest</text>
      <text x={W} y={H + 13} textAnchor="end" fontSize="10" fill="#5d6975" style={{ fontFamily: "var(--font-mono)" }}>slowest</text>
    </svg>
  );
}
