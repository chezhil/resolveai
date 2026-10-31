import { SealCheck } from "@phosphor-icons/react";
import { useI18n } from "../lib/i18n";

const STAGES = [
  { k: "how.hear", detail: "Kannada voice note · ₹480 · RRN found" },
  { k: "how.plan", detail: "search_transactions → get_bank_status" },
  { k: "how.check", detail: "P3 grounded · P4 inside L1 cap · ALLOW" },
  { k: "how.act", detail: "raise_bank_ticket · capability signed" },
  { k: "how.verify", detail: "Ledger re-read · credit landed" },
];

const PITCH = 84; // px between stage rows; the chip walks four pitches

/** One case, end to end. The rupee chip walks the loop; each stage lights as it passes. Pure CSS motion. */
export function Pipeline() {
  const { t } = useI18n();
  return (
    <div className="relative w-full max-w-[460px]" style={{ ["--walk" as string]: `${PITCH * 4}px` }} role="img" aria-label="Hear, plan, check, act, verify">
      <div className="absolute bottom-6 left-[19px] top-6 w-px bg-night-line" aria-hidden />
      <ol className="relative grid" style={{ rowGap: PITCH - 56 }}>
        {STAGES.map((s, i) => (
          <li key={s.k} className="grid grid-cols-[40px_1fr] items-center gap-4" style={{ height: 56 }}>
            <span className="pipe-spacer" aria-hidden />
            <div
              className={`pipe-node ${i === STAGES.length - 1 ? "last" : ""} flex items-center justify-between gap-3 rounded-2xl border bg-night-2 px-4 py-2.5`}
              style={{ ["--i" as string]: i, animationDelay: i === STAGES.length - 1 ? undefined : `calc(${i} * 1.7s - 1.1s)` }}
            >
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-fog">{t(s.k)}</div>
                <div className="truncate font-mono text-[11.5px] text-fog-muted">{s.detail}</div>
              </div>
              {i === STAGES.length - 1 && <SealCheck size={22} weight="fill" className="pipe-settle shrink-0 text-verified" aria-hidden />}
            </div>
          </li>
        ))}
      </ol>
      <div className="pipe-chip absolute left-0 top-[8px] grid h-10 w-10 place-items-center rounded-full bg-cyan font-mono text-[11px] font-semibold text-night" aria-hidden>
        ₹480
      </div>
    </div>
  );
}
