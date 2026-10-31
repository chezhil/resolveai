import { useEffect, useRef, useState } from "react";

/**
 * "How it works": the five stages of every case, in order. The right-hand trace window is pinned while the left column scrolls, and
 * each stage types its lines into the window. The content is scenario A in the console (a silent soundbox), shortened; the real
 * trace for any case is on the Console page.
 */
interface Stage {
  key: string;
  name: string;
  line: string;
  detail: string;
  lines: { tag: string; text: string; tone?: "ok" | "warn" | "bad" }[];
}

const STAGES: Stage[] = [
  {
    key: "HEAR",
    name: "Hear",
    line: "The merchant speaks. In their language.",
    detail: "A Kannada voice note, a Hinglish text or a payment event. Language, intent and urgency are read deterministically, and personal data is tokenised before any model sees it.",
    lines: [
      { tag: "triage", text: "language=kn  workflow=failed_payment  signals=paid-but-no-credit" },
      { tag: "pii", text: "<PHONE_1> <VPA_1> tokenised, encrypted per case" },
      { tag: "guard", text: "no instruction found in the message", tone: "ok" },
    ],
  },
  {
    key: "PLAN",
    name: "Plan",
    line: "The model proposes. Nothing it says is trusted.",
    detail: "The brain asks for tool calls to gather facts. It can be Groq, Gemini or the offline planner. The guarantees do not depend on which one.",
    lines: [
      { tag: "brain", text: "propose lookup_merchant, search_transactions, get_psp_status" },
      { tag: "kb", text: "RBI rule: failed-payment credit reverses within the turnaround time" },
      { tag: "note", text: "facts come only from tool output, never from the model", tone: "warn" },
    ],
  },
  {
    key: "CHECK",
    name: "Check",
    line: "A deterministic policy engine decides.",
    detail: "Every proposed action meets rules P0 to P14, value tiers and least privilege. The verdict is ALLOW, NEEDS_APPROVAL, BLOCK or ESCALATE. Allowed actions get a signed, single-use capability.",
    lines: [
      { tag: "P3", text: "ledger-confirmed fact present for this payment", tone: "ok" },
      { tag: "L1", text: "bank push-credit ticket is low value and reversible → ALLOW", tone: "ok" },
      { tag: "P1", text: "a payout-account change from chat → BLOCK", tone: "bad" },
    ],
  },
  {
    key: "ACT",
    name: "Act",
    line: "Across systems, within limits.",
    detail: "Bank ticket, settlement release, dispute evidence, a message in the merchant's language with the exact time, and a watcher for the money. Above the limit, a human signs.",
    lines: [
      { tag: "act", text: "raise_bank_ticket  push-credit to the merchant", tone: "ok" },
      { tag: "act", text: "set_watcher  re-check the bank next morning" },
      { tag: "msg", text: "reply in Kannada with the exact time; payer told not to pay twice" },
    ],
  },
  {
    key: "VERIFY",
    name: "Verify",
    line: "Closed only when the money moved.",
    detail: "A watcher wakes the case, the verifier re-reads the ledger and the bank, and only then does the case close. If the deadline passes, a human gets the case file.",
    lines: [
      { tag: "watch", text: "+1 day: watcher fires, bank re-read" },
      { tag: "verify", text: "ledger shows the merchant credited ₹480", tone: "ok" },
      { tag: "close", text: "soundbox announces the credit · case RESOLVED · PII shredded", tone: "ok" },
    ],
  },
];

const TONE = { ok: "text-mintfill", warn: "text-[#e8cf6a]", bad: "text-redfill" } as const;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-38% 0px -50% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  const s = STAGES[active] ?? STAGES[0];

  return (
    <div className="mt-16 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
      <ol className="space-y-[14vh] pb-[4vh] pt-2 lg:space-y-[20vh]">
        {STAGES.map((st, i) => (
          // The li's className must never change: `.reveal` is toggled on it by the shared observer, and React would overwrite that class
          // on every re-render. The active/inactive dimming lives on the inner element instead.
          <li key={st.key} ref={(el) => void (refs.current[i] = el)} data-i={i} className="reveal">
            <div className={`transition-opacity duration-500 ${active === i ? "opacity-100" : "opacity-45"}`}>
              <div className="font-mono text-[13px] text-ok">
                0{i + 1} · {st.key}
              </div>
              <h3 className="display mt-3 text-[clamp(2rem,4.2vw,3.1rem)]">{st.line}</h3>
              <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-text-2">{st.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="overflow-hidden rounded-[18px] border border-ink bg-night shadow-[8px_8px_0_#0b1218]">
          <div className="flex items-center gap-2 border-b border-night-line px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden>
              <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
              <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
              <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
            </span>
            <span className="font-mono text-[11.5px] text-fog-muted">scenario A · a silent soundbox · simplified</span>
          </div>

          {/* stage rail: the filled part grows to the active stage */}
          <div className="px-5 pt-5">
            <div className="relative flex justify-between" role="tablist" aria-label="Stages of a case">
              <span aria-hidden className="absolute left-[10px] right-[10px] top-[10px] h-[2px] bg-night-line" />
              <span aria-hidden className="absolute left-[10px] top-[10px] h-[2px] bg-mintfill transition-[width] duration-700 ease-out" style={{ width: `calc((100% - 20px) * ${active / (STAGES.length - 1)})` }} />
              {STAGES.map((st, i) => (
                <button key={st.key} role="tab" aria-selected={active === i} onClick={() => go(i)} className="relative z-10 flex cursor-pointer flex-col items-center gap-2">
                  <span className={`grid h-[22px] w-[22px] place-items-center rounded-full border-2 transition-all duration-500 ${i <= active ? "border-mintfill bg-mintfill" : "border-night-line bg-night"} ${i === active ? "scale-125 shadow-[0_0_0_5px_rgba(61,219,176,0.18)]" : ""}`}>
                    {i < active && (
                      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                        <path d="M2.5 6.2l2.4 2.3 4.6-5" fill="none" stroke="#0b1218" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors ${i === active ? "text-fog" : "text-fog-muted"}`}>{st.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div key={s.key} className="min-h-[250px] space-y-3 px-5 pb-6 pt-6 font-mono text-[12.5px] leading-relaxed" aria-live="polite">
            {s.lines.map((l, i) => (
              <div key={l.text} className="trace-line flex gap-3" style={{ animationDelay: `${120 + i * 260}ms` }}>
                <span className="w-[52px] shrink-0 text-fog-muted">{l.tag}</span>
                <span className={l.tone ? TONE[l.tone] : "text-fog"}>{l.text}</span>
              </div>
            ))}
            <div className="trace-line pt-2 text-[11.5px] text-fog-muted" style={{ animationDelay: `${120 + s.lines.length * 260}ms` }}>
              ▸ every step is written to a hash-chained audit log
            </div>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-text-2">Open the Console and run scenario A to watch the real trace, with every tool call and policy verdict.</p>
      </div>
    </div>
  );
}
