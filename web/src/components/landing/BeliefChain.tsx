import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useI18n } from "../../lib/i18n";

gsap.registerPlugin(ScrollTrigger);

const NODES = [
  { tag: "Observed", text: "Ledger: two credited payments of ₹4,500 from one payer", src: "search_transactions" },
  { tag: "Believed", text: "Duplicate debit: only the later payment is refundable", src: "policy P14" },
  { tag: "Proposed", text: "Refund ₹4,500 to the payer, waiting for a human", src: "approval APR-0001" },
] as const;

/**
 * The idea nobody else in the room has: every proposed action records the facts it rests on.
 * Scroll plays one story. A late bank message flips an observed fact, the change travels down the
 * chain, and the pending approval is pulled before anyone can sign it. Same behaviour as scenario H in the console.
 */
export function BeliefChain() {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();

    const build = (pin: boolean) => {
      const nodes = gsap.utils.toArray<HTMLElement>(".bc-node", el);
      const hot = "#ff7a59";
      const tl = gsap.timeline({
        scrollTrigger: pin
          ? { trigger: el, start: "top top", end: "+=1400", scrub: 0.6, pin: true, invalidateOnRefresh: true }
          : { trigger: el, start: "top 70%", toggleActions: "play none none none" },
      });
      tl.from(nodes, { opacity: 0, y: 24, stagger: 0.25, duration: 0.5 })
        .from(".bc-link", { scaleX: 0, transformOrigin: "left center", stagger: 0.25, duration: 0.4 }, "<0.2")
        .from(".bc-hook", { opacity: 0, y: -30, duration: 0.5 }, "+=0.4")
        .to(nodes[0], { borderColor: hot, backgroundColor: "rgba(255,122,89,0.12)", duration: 0.4 })
        .to(".bc-late", { opacity: 1, y: 0, duration: 0.4 }, "<")
        .to(nodes[1], { borderColor: hot, backgroundColor: "rgba(255,122,89,0.12)", duration: 0.4 }, "+=0.2")
        .to(nodes[2], { borderColor: hot, backgroundColor: "rgba(255,122,89,0.12)", duration: 0.4 }, "+=0.2")
        .to(".bc-result", { opacity: 1, y: 0, duration: 0.5 }, "+=0.2");
    };

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => build(true));
    mm.add("(max-width: 767px) and (prefers-reduced-motion: no-preference)", () => build(false));
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".bc-late, .bc-result", { opacity: 1, y: 0 });
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={root} id="belief" className="relative border-b border-night-line bg-night-2/60">
      <div className="mx-auto flex max-w-6xl flex-col justify-center gap-10 px-5 py-20 md:min-h-[100dvh]">
        <div>
          <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("belief.title")}</h2>
          <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-fog-muted">{t("belief.body")}</p>
        </div>

        <div className="relative">
          <div className="bc-hook mb-4 flex items-center gap-3">
            <div className="bc-late translate-y-2 rounded-[10px] border border-[#ff7a59] bg-[#ff7a59]/10 px-4 py-2 font-mono text-[12.5px] text-[#ffb09c] opacity-0">
              Late bank message: payment reversed to the payer
            </div>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {NODES.map((n, i) => (
              <li key={n.tag} className="relative">
                <div className="bc-node h-full rounded-2xl border border-night-line bg-night px-5 py-5">
                  <div className="font-mono text-[12px] uppercase tracking-wider text-cyan">{n.tag}</div>
                  <p className="mt-2 text-[16px] leading-snug text-fog">{n.text}</p>
                  <div className="mt-3 font-mono text-[11.5px] text-fog-muted">{n.src}</div>
                </div>
                {i < NODES.length - 1 && <div className="bc-link absolute -right-4 top-1/2 hidden h-px w-4 bg-night-line md:block" aria-hidden />}
              </li>
            ))}
          </ol>
          <div className="bc-result mt-6 translate-y-2 rounded-2xl border border-[#ff7a59] bg-night px-5 py-4 opacity-0">
            <div className="font-mono text-[12px] uppercase tracking-wider text-[#ff9d82]">Quarantined</div>
            <p className="mt-1 text-[16px] text-fog">No human can sign the refund. The case goes to a person with the changed fact attached, and the money never moves.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
