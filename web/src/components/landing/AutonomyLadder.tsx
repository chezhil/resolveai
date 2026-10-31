import { useEffect, useRef, useState } from "react";

/** The four autonomy levels as a ladder that climbs as it scrolls into view. Examples and limits are the ones in the policy engine and README. */
const LEVELS = [
  { id: "L0", name: "Inform", tone: "bg-sun", what: "Read-only answers from live state.", example: "Every lookup tool: ledger, PSP status, settlement, KYC.", who: "The agent alone" },
  { id: "L1", name: "Act within limits", tone: "bg-sky", what: "Low value, reversible, auto-approved.", example: "Push-credit bank ticket, dispute evidence filing, refunds up to ₹2,000.", who: "The agent alone" },
  { id: "L2", name: "Act with approval", tone: "bg-rose", what: "Higher value: a human confirms with one click.", example: "Releasing a ₹1,84,300 settlement hold. Above ₹1 L, two different people must sign.", who: "Agent proposes, human signs" },
  { id: "L3", name: "Escalate", tone: "bg-ember", what: "Fraud signals, ambiguity or an angry customer.", example: "A payout-account change during a SIM swap goes to the fraud desk with a full case file.", who: "A human takes over" },
];

export function AutonomyLadder() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-14">
      <ol className="grid items-end gap-4 md:grid-cols-4">
        {LEVELS.map((l, i) => (
          <li
            key={l.id}
            onMouseEnter={() => setHot(i)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            tabIndex={0}
            className={`ladder-step group relative flex flex-col rounded-[18px] border-[1.5px] border-ink p-5 outline-none transition-all duration-500 ease-out ${l.tone} ${seen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"} ${hot === i ? "-translate-y-1.5 shadow-[6px_6px_0_#0b1218]" : "shadow-[0_0_0_#0b1218]"}`}
            style={{ transitionDelay: seen ? `${i * 140}ms` : "0ms", minHeight: `${210 + i * 34}px` }}
          >
            <div className="flex items-baseline justify-between">
              <span className="display text-[2.6rem]">{l.id}</span>
              <span className="label rounded-full border border-ink/40 bg-white/60 px-2 py-0.5 text-[10px]">{l.who}</span>
            </div>
            <h3 className="mt-2 font-display text-[19px] font-bold leading-tight">{l.name}</h3>
            <p className="mt-2 text-[14px] leading-snug">{l.what}</p>
            <p className="mt-auto pt-4 text-[13px] leading-snug text-ink/75">{l.example}</p>
          </li>
        ))}
      </ol>
      {/* the autonomy gauge: how much a human is involved */}
      <div className="mt-6 flex items-center gap-3 font-mono text-[11.5px] text-text-2" aria-hidden>
        <span>agent acts alone</span>
        <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-ink/15">
          <span className="absolute inset-y-0 left-0 rounded-full bg-ink transition-[width] duration-[1600ms] ease-out" style={{ width: seen ? "100%" : "0%" }} />
        </span>
        <span>human decides</span>
      </div>
      <p className="mt-4 max-w-[70ch] text-[14px] text-text-2">Bounded autonomy: the model proposes, and a deterministic policy decides which level an action falls in. Above ₹5 L, even a human approval is not enough from the queue: the case is escalated.</p>
    </div>
  );
}
