import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Link, useLocation } from "react-router";
import { accuracyByWorkflow, humanDuration, summarise, useEvalReport, WORKFLOW_LABEL } from "../../lib/analytics";

/** Flips to true the first time the element is on screen. Works for content that mounts after data arrives, unlike a mount-time observer. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
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
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** Counts up to `to` over `ms` once `run` is true. Respects reduced motion by jumping straight to the end. */
function useCount(to: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

export function ProofCharts() {
  const { data, error } = useEvalReport();
  const { search } = useLocation();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const proof = data ? summarise(data) : null;
  const go = seen && !!proof;

  const agentPct = proof ? Math.round((proof.agentCorrect / proof.tickets) * 100) : 0;
  const humanPct = proof ? Math.round((proof.humanCorrect / proof.tickets) * 100) : 0;
  const a = useCount(agentPct, go);
  const h = useCount(humanPct, go);

  return (
    <div ref={ref} className="mt-20 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      {/* the race: the same kind of ticket, a human and the agent */}
      <section aria-label="Time to a decision, human against agent" className="rounded-[18px] border border-ink/15 bg-white p-6 sm:p-7">
        <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-2">Same tickets, two timelines</div>
        <h3 className="display mt-2 text-[clamp(1.7rem,3vw,2.3rem)]">{proof ? `${humanDuration(proof.medianHumanMinutes)} against ${humanDuration(proof.medianAgentMinutes)}` : "A day against seconds"}</h3>
        <p className="mt-2 max-w-[52ch] text-[14.5px] leading-snug text-text-2">Median time to a decision across {proof ? proof.tickets : 14} replayed tickets. The agent is measured on the simulated clock in shadow mode, so this is time to a decision, not time until the money lands.</p>

        <div className="mt-6 space-y-5" aria-hidden={!proof}>
          <Lane label="Human agent" tone="bg-[#98a29b]" widthPct={100} go={go} ms={3200} value={proof ? humanDuration(proof.medianHumanMinutes) : "…"} />
          <Lane label="ResolveAI" tone="bg-mintfill" widthPct={proof ? Math.max(1.2, (proof.medianAgentMinutes / proof.medianHumanMinutes) * 100) : 1.2} go={go} ms={500} value={proof ? humanDuration(proof.medianAgentMinutes) : "…"} accent />
        </div>
        {error && <p role="alert" className="mt-4 text-[13px] text-bad">Live numbers are unavailable right now ({error}).</p>}

        <div className="mt-7 grid grid-cols-2 gap-3">
          <div className="rounded-[14px] border border-ink/15 bg-sky/50 p-4">
            <div className="display text-[2.4rem]">{proof ? proof.contactsAvoided : "…"}</div>
            <div className="mt-1 text-[13px] font-bold leading-tight">back-and-forth contacts avoided</div>
            <div className="mt-0.5 text-[12px] text-text-2">{proof ? `${proof.humanContactsTotal} for humans, ${proof.tickets} for the agent` : ""}</div>
          </div>
          <div className="rounded-[14px] border border-ink/15 bg-rose/60 p-4">
            <div className="display text-[2.4rem]">{proof ? proof.humanErrors.length : "…"}</div>
            <div className="mt-1 text-[13px] font-bold leading-tight">tickets where the human call was wrong</div>
            <div className="mt-0.5 text-[12px] text-text-2">including a payout change on chat that was an account takeover</div>
          </div>
        </div>
      </section>

      <section aria-label="Right call rate, agent against human" className="flex flex-col rounded-[18px] border border-ink bg-ink p-6 text-white sm:p-7">
        <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-white/60">Right call, same tickets</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="display text-[clamp(2.6rem,5vw,3.8rem)] text-mintfill">{proof ? Math.round(a) : "…"}%</div>
            <div className="mt-1 text-[13px] font-bold">ResolveAI</div>
            <div className="text-[12px] text-white/60">{proof ? `${proof.agentCorrect} of ${proof.tickets}` : ""}</div>
          </div>
          <div>
            <div className="display text-[clamp(2.6rem,5vw,3.8rem)] text-white/80">{proof ? Math.round(h) : "…"}%</div>
            <div className="mt-1 text-[13px] font-bold">Human agents</div>
            <div className="text-[12px] text-white/60">{proof ? `${proof.humanCorrect} of ${proof.tickets}` : ""}</div>
          </div>
        </div>

        <ul className="mt-6 space-y-2.5">
          {(data ? accuracyByWorkflow(data.shadow.rows) : []).map((w, i) => (
            <li key={w.workflow} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 text-[12px]">
              <span className="truncate text-white/75">{WORKFLOW_LABEL[w.workflow] ?? w.workflow}</span>
              <span className="flex flex-col gap-1">
                <Bar pct={(w.agent / w.tickets) * 100} go={go} delay={i * 90} color="#3ddbb0" />
                <Bar pct={(w.human / w.tickets) * 100} go={go} delay={i * 90 + 60} color="#98a29b" />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11.5px] leading-snug text-white/55">Synthetic tickets, labelled by an ops reviewer. The 14 tickets are a method demonstration; a 30-day shadow pilot on real tickets is the real test.</p>
        <Link to={{ pathname: "/app/analytics", search }} className="btn-line mt-5 self-start border-white px-5 py-2.5 text-[14px] !text-white hover:!bg-white/10">
          Open the full analytics
          <ArrowUpRight size={15} weight="bold" aria-hidden />
        </Link>
      </section>
    </div>
  );
}

function Lane({ label, tone, widthPct, go, ms, value, accent }: { label: string; tone: string; widthPct: number; go: boolean; ms: number; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
        <span className="font-bold">{label}</span>
        <span className={`font-display text-[22px] font-bold ${accent ? "text-ok" : ""}`}>{value}</span>
      </div>
      <div className="h-[14px] overflow-hidden rounded-full bg-ink/10" role="presentation">
        <div className={`h-full rounded-full ${tone}`} style={{ width: go ? `${widthPct}%` : "0%", transition: `width ${ms}ms cubic-bezier(0.2,0.8,0.2,1)` }} />
      </div>
    </div>
  );
}

function Bar({ pct, go, delay, color }: { pct: number; go: boolean; delay: number; color: string }) {
  return (
    <span className="block h-[6px] overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full" style={{ width: go ? `${pct}%` : "0%", background: color, transition: `width 900ms cubic-bezier(0.2,0.8,0.2,1) ${delay}ms` }} />
    </span>
  );
}
