import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useI18n } from "../../lib/i18n";

gsap.registerPlugin(ScrollTrigger);

const STAGES = [
  { k: "hear", eg: "triage: language kn · workflow failed_payment · ₹480 · PII tokenised" },
  { k: "plan", eg: "search_transactions → get_bank_status → paytm_order_status" },
  { k: "check", eg: "P3 grounded · P4 inside the L1 cap · verdict ALLOW" },
  { k: "act", eg: "raise_bank_ticket · one-time capability signed, tool runs once" },
  { k: "verify", eg: "ledger re-read after the bank credits · case closes" },
] as const;

/**
 * The loop as a story. On desktop the section pins and the five stages slide past as you scroll:
 * the order is the point (hear, then plan, then check, then act, then verify), so the motion carries it.
 * On phones and under reduced motion the stages simply stack.
 */
export function HowPinned() {
  const { t } = useI18n();
  const wrap = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    const tr = track.current;
    if (!el || !tr) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const distance = () => Math.max(0, tr.scrollWidth - window.innerWidth);
      gsap.to(tr, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
          },
        },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="how" ref={wrap} className="relative overflow-hidden border-y border-night-line">
      <div className="mx-auto max-w-6xl px-5 pt-20">
        <h2 className="max-w-[18ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("how.title")}</h2>
      </div>
      <div ref={track} className="flex flex-col gap-10 px-5 py-14 md:min-h-[70dvh] md:w-max md:flex-row md:items-stretch md:gap-0 md:px-0 md:py-16">
        <div className="hidden md:block md:w-[max(2rem,calc((100vw-72rem)/2))] md:shrink-0" aria-hidden />
        {STAGES.map((s) => (
          <article key={s.k} className="flex flex-col justify-between gap-10 border-t border-night-line pt-6 md:w-[min(34rem,80vw)] md:shrink-0 md:border-l md:border-t-0 md:px-10 md:pt-2">
            <div>
              <h3 className="text-5xl font-semibold tracking-tight md:text-7xl">{t(`how.${s.k}`)}</h3>
              <p className="mt-6 max-w-[38ch] text-lg leading-relaxed text-fog-muted">{t(`how.${s.k}.d`)}</p>
            </div>
            <code className="block max-w-[44ch] rounded-[10px] border border-night-line bg-night px-4 py-3 font-mono text-[12.5px] leading-relaxed text-cyan">{s.eg}</code>
          </article>
        ))}
        <div className="hidden md:block md:w-24 md:shrink-0" aria-hidden />
      </div>
      <div className="mx-auto hidden h-px max-w-6xl bg-night-line md:block" aria-hidden>
        <div ref={bar} className="h-px origin-left bg-cyan" style={{ transform: "scaleX(0)" }} />
      </div>
      <div className="h-10" aria-hidden />
    </section>
  );
}
