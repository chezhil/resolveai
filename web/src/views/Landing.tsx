// Landing page. Design read: product page for hackathon judges, Paytm-ecosystem merchants and investors,
// in the "paper and ink" language of the Quorum site: cool paper, near-black ink, heavy display type with one
// outlined italic word, a dark graph panel, hard-shadow shapes and corner crop marks. Dials: variance 7, motion 6,
// density 4. One theme (light) with dark product panels; one radius system (panels 18, controls 12, pills round).

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ArrowUpRight, Play } from "@phosphor-icons/react";
import { useI18n } from "../lib/i18n";
import { useReveal } from "../lib/reveal";
import { LangSwitch } from "../components/LangSwitch";
import { GraphPanel } from "../components/landing/GraphPanel";
import { CopyBlock } from "./Plugins";

gsap.registerPlugin(ScrollTrigger);

/** Router link that keeps the query string, so ?room=judges survives landing -> console. */
function RoomLink({ to, ...props }: { to: string } & Omit<React.ComponentProps<typeof Link>, "to">) {
  const { search } = useLocation();
  return <Link to={{ pathname: to, search }} {...props} />;
}

const SECTIONS = [
  { id: "top", label: "Top" },
  { id: "problem", label: "Problem" },
  { id: "playground", label: "Playground" },
  { id: "defense", label: "Defence" },
  { id: "console", label: "Console" },
  { id: "proof", label: "Proof" },
  { id: "languages", label: "Languages" },
  { id: "plugins", label: "Plugins" },
  { id: "honest", label: "Honest" },
];

const GREETINGS = ["नमस्ते", "ನಮಸ್ಕಾರ", "வணக்கம்", "నమస్కారం", "नमस्कार", "নমস্কার", "નમસ્તે", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "നമസ്കാരം", "ନମସ୍କାର", "Hello"];
const STACK = ["Paytm Build for India", "Sarvam AI", "Groq", "Gemini", "Model Context Protocol", "Twilio WhatsApp", "SQLite", "React", "TypeScript", "GSAP", "Zod"];

const REDLINES = [
  { id: "P1", text: "A payout account is never changed from a chat." },
  { id: "P3", text: "No action without a fact the ledger confirmed." },
  { id: "P6", text: "No account number, PAN, Aadhaar or phone in any outgoing message." },
  { id: "P10", text: "A message that tries to instruct the agent forces a human approval." },
  { id: "P13", text: "Above ₹1,00,000, two different people must approve." },
];

const SHOTS = [
  { id: "console", label: "Live console", src: "/shots/console.png", text: "The agent trace, the merchant's phone and the case file, updating as the agent works." },
  { id: "quarantine", label: "Quarantine", src: "/shots/quarantine.png", text: "A late bank message pulls the pending refund before anyone can sign it." },
  { id: "provenance", label: "Provenance", src: "/shots/provenance.png", text: "Every case as a graph: facts from tools feed the policy engine, which led to each decision and outcome." },
  { id: "approvals", label: "Approvals", src: "/shots/approvals.png", text: "Humans approve with their own PIN. Above one lakh, two different people must sign." },
  { id: "plugins", label: "Plugins", src: "/shots/plugins.png", text: "Connect your own tools over MCP, check what is configured, and test Sarvam translation." },
  { id: "evals", label: "Evals", src: "/shots/evals.png", text: "Golden cases, red-team attacks and a shadow replay you can run from the page." },
  { id: "audit", label: "Audit", src: "/shots/audit.png", text: "A hash-chained log with published anchors, and a button that tries to tamper with it." },
];

export function Landing() {
  const { t } = useI18n();
  const root = useReveal<HTMLDivElement>();
  const [active, setActive] = useState("top");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTIONS.forEach((s) => {
      const n = el.querySelector(`#${s.id}`);
      if (n) io.observe(n);
    });
    return () => io.disconnect();
  }, [root]);

  return (
    <div ref={root} className="landing">
      <i className="crop tl" aria-hidden />
      <i className="crop tr" aria-hidden />
      <i className="crop bl" aria-hidden />
      <i className="crop br" aria-hidden />
      <nav aria-label="Page sections" className="fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 xl:flex">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-label={s.label}
            aria-current={active === s.id}
            className={`block h-3 w-3 border-[1.5px] border-ink transition-all ${s.id === active ? "rotate-45 bg-mintfill" : "bg-transparent hover:bg-ink/20"}`}
          />
        ))}
      </nav>
      <Nav />
      <main>
        <Hero />
        <Stack />
        <Problem />
        <Playground />
        <Defense />
        <ConsoleTour />
        <Proof />
        <Languages />
        <Plugins />
        <Honest />
      </main>
      <footer className="border-t border-ink/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-[13px] text-text-2">
          <p>{t("footer.built")}</p>
          <p>{t("footer.disc")}</p>
        </div>
      </footer>
    </div>
  );
}

function Nav() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="ResolveAI home">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-ink font-display text-[17px] font-bold text-mintfill">R</span>
          <span className="font-display text-[20px] font-bold tracking-tight">ResolveAI</span>
        </Link>
        <nav aria-label="Sections" className="ml-8 hidden items-center gap-6 text-[14px] font-medium text-text-2 lg:flex">
          <a className="hover:text-ink" href="#problem">
            {t("nav.how")}
          </a>
          <a className="hover:text-ink" href="#playground">
            Playground
          </a>
          <a className="hover:text-ink" href="#defense">
            {t("nav.safety")}
          </a>
          <a className="hover:text-ink" href="#console">
            Console
          </a>
          <a className="hover:text-ink" href="#languages">
            {t("nav.languages")}
          </a>
          <a className="hover:text-ink" href="#plugins">
            {t("nav.plugins")}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangSwitch />
          <span className="hidden sm:block">
            <RoomLink to="/app" className="btn-ink px-5 py-2.5 text-[14px]">
              {t("nav.cta")}
              <ArrowRight size={16} weight="bold" aria-hidden />
            </RoomLink>
          </span>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { t, lang } = useI18n();
  const shapes = useRef<HTMLDivElement>(null);
  const [first, ...rest] = t("hero.l2").split(" ");

  useEffect(() => {
    const el = shapes.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".hero-in", { y: 40, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 });
      gsap.from(".hero-panel", { y: 60, opacity: 0, duration: 1, ease: "power3.out", delay: 0.35 });
      gsap.to(".shape-a", { y: -40, rotate: 8, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.8 } });
      gsap.to(".shape-b", { y: 60, rotate: -10, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.8 } });
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="top" ref={shapes} className="relative mx-auto max-w-6xl px-6 pb-16 pt-14 md:pt-20">
      <div aria-hidden className="shape-a absolute right-[9%] top-16 hidden h-[74px] w-[74px] rounded-full border-[3px] border-ink bg-mintfill shadow-[5px_5px_0_#0b1218] md:block" />
      <div aria-hidden className="shape-b absolute right-[4%] top-[46%] hidden h-[62px] w-[62px] rounded-[10px] border-[3px] border-ink bg-redfill shadow-[5px_5px_0_#0b1218] md:block" />
      <div className="hero-in inline-flex max-w-full items-center gap-2 rounded-full border border-ink/25 bg-white/60 px-4 py-1.5 font-mono text-[12px] text-text-2">
        <i className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden />
        <span className="truncate">Paytm Build for India · Track 3 · Autonomous AI teammate</span>
      </div>
      <h1 className="display mt-8 text-[clamp(2.7rem,7.4vw,6.1rem)]">
        <span className="hero-in block">{t("hero.l1")}</span>
        <span className="hero-in block">
          {lang === "en" ? (
            <>
              <span className="outline-word mr-[0.14em] inline-block pr-[0.06em]">{first}</span>
              {rest.join(" ")}
            </>
          ) : (
            <span className="mark">{t("hero.l2")}</span>
          )}
        </span>
      </h1>
      <p className="hero-in mt-8 max-w-[52ch] text-[19px] leading-relaxed text-text-2">{t("hero.sub")}</p>
      <div className="hero-in mt-9 flex flex-wrap items-center gap-3">
        <RoomLink to="/app" className="btn-ink px-7 py-4 text-[16px]">
          {t("hero.cta1")}
          <ArrowRight size={18} weight="bold" aria-hidden />
        </RoomLink>
        <a href="#playground" className="btn-line px-7 py-4 text-[16px]">
          <Play size={15} weight="fill" aria-hidden />
          Watch it contain a late bank message
        </a>
      </div>
      <div className="hero-panel mt-14">
        <GraphPanel mode="loop" />
      </div>
    </section>
  );
}

function Stack() {
  const row = [...STACK, ...STACK];
  return (
    <div className="overflow-hidden border-y border-ink/15 bg-white/50 py-4" aria-hidden>
      <div className="marquee-track flex items-center gap-8 font-mono text-[13px] text-text-2">
        {row.map((s, i) => (
          <span key={i} className="flex items-center gap-8 whitespace-nowrap">
            {s}
            <i className="h-2 w-2 rotate-45 bg-ink" />
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionHead({ marker, title, body }: { marker: string; title: React.ReactNode; body?: string }) {
  return (
    <div className="reveal">
      <div className="font-mono text-[12px] text-text-2">
        <span className="mr-2">[{marker}]</span>
      </div>
      <h2 className="display mt-4 max-w-[22ch] text-[clamp(2.4rem,6vw,4.4rem)]">{title}</h2>
      {body && <p className="mt-6 max-w-[56ch] text-[18px] leading-relaxed text-text-2">{body}</p>}
    </div>
  );
}

const PROBLEM = [
  { n: "01", h: "The merchant waits", p: "A customer paid, the soundbox stayed silent, and the merchant cannot tell whether the money is lost or just late.", focus: 0 },
  { n: "02", h: "Support guesses", p: "Agents read one bank status, assume the rest, and promise a time they cannot keep.", focus: 1 },
  { n: "03", h: "Money moves on stale facts", p: "A refund goes out on a status that changed minutes later, and nobody can say what it depended on.", focus: 3 },
];

function Problem() {
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setFocus(Number((e.target as HTMLElement).dataset.focus));
      },
      { rootMargin: "-40% 0px -45% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);
  return (
    <section id="problem" className="mx-auto max-w-6xl px-6 py-28">
      <SectionHead marker="01" title={<>A stuck payment hides three problems.</>} />
      <div className="mt-16 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-[34vh] pb-[20vh] pt-2">
          {PROBLEM.map((s, i) => (
            <div key={s.n} ref={(el) => void (refs.current[i] = el)} data-focus={s.focus} className="reveal">
              <div className="font-mono text-[13px] text-ok">{s.n}</div>
              <h3 className="display mt-3 text-[clamp(2rem,4.4vw,3.2rem)]">{s.h}</h3>
              <p className="mt-4 max-w-[40ch] text-[17px] leading-relaxed text-text-2">{s.p}</p>
            </div>
          ))}
        </div>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <GraphPanel mode="focus" focus={focus} />
        </div>
      </div>
    </section>
  );
}

function Playground() {
  return (
    <section id="playground" className="border-y border-ink/15 bg-white/50 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead marker="02" title={<>Break something. We will contain it.</>} body="Click any fact. ResolveAI marks everything built on it and holds what has not run. The same logic runs in the console as scenario H." />
        <div className="reveal mt-12">
          <GraphPanel mode="play" />
          <p className="mt-4 text-[13px] text-text-2">An illustration of the real behaviour. Run scenario H in the console to see the engine do it with its audit trail.</p>
        </div>
      </div>
    </section>
  );
}

const LAYERS = [
  {
    k: "Prevent",
    h: "Policy decides, not the model",
    p: "Fifteen deterministic rules gate every action. The model proposes, the rules answer allow, ask a human, block or escalate. These lines hold whatever a prompt says.",
  },
  {
    k: "Refuse",
    h: "A signed, single-use capability",
    p: "Allowed actions get a one-time token bound to the exact tool, input and case. The money rail refuses a call without it, so a forged call or a replay moves nothing.",
    code: "capability · tool=initiate_refund · case=CASE-0001 · expires 60s · single use",
  },
  {
    k: "Verify",
    h: "The ledger has the last word",
    p: "A case closes only after the ledger, settlement or dispute system shows the money moved. If a fact changes while a person decides, the approval is quarantined.",
  },
];

function Defense() {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const L = LAYERS[i];
  return (
    <section id="defense" className="mx-auto max-w-6xl px-6 py-28">
      <SectionHead marker="03" title={<>Stop it. Refuse it. Verify it.</>} body={t("safety.body")} />
      <div className="reveal mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div role="tablist" aria-label="Layers of defence" className="flex flex-row gap-2 lg:flex-col">
          {LAYERS.map((l, n) => (
            <button
              key={l.k}
              role="tab"
              aria-selected={i === n}
              onClick={() => setI(n)}
              className={`flex cursor-pointer items-center justify-between rounded-[14px] border-[1.5px] px-5 py-4 text-left text-[18px] font-bold transition-all ${
                i === n ? "border-ink bg-white shadow-[5px_5px_0_#0b1218]" : "border-ink/20 hover:border-ink/60"
              }`}
            >
              <span>{l.k}</span>
              <span className="font-mono text-[12px] font-medium text-text-2">0{n + 1} / 03</span>
            </button>
          ))}
        </div>
        <div className="rounded-[18px] border border-ink/15 bg-white p-8">
          <h3 className="display text-[clamp(1.8rem,3.4vw,2.6rem)]">{L.h}</h3>
          <p className="mt-4 max-w-[54ch] text-[17px] leading-relaxed text-text-2">{L.p}</p>
          {i === 0 && (
            <ul className="mt-6 divide-y divide-ink/10 rounded-[12px] border border-ink/15">
              {REDLINES.map((r) => (
                <li key={r.id} className="flex items-baseline gap-4 px-4 py-3">
                  <span className="w-10 shrink-0 font-mono text-[13px] text-ok">{r.id}</span>
                  <span className="text-[15px] leading-snug">{r.text}</span>
                </li>
              ))}
            </ul>
          )}
          {L.code && <code className="mt-6 block rounded-[12px] bg-night px-4 py-3 font-mono text-[12.5px] leading-relaxed text-mintfill">{L.code}</code>}
        </div>
      </div>
    </section>
  );
}

function ConsoleTour() {
  const [i, setI] = useState(0);
  const s = SHOTS[i];
  return (
    <section id="console" className="border-y border-ink/15 bg-white/50 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead marker="04" title={<>Every step is on screen.</>} body="Real screenshots of the running console, not mock-ups." />
        <div className="reveal mt-12 grid gap-8 lg:grid-cols-[260px_1fr]">
          <div role="tablist" aria-label="Console views" className="scroll-thin flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SHOTS.map((x, n) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={i === n}
                onClick={() => setI(n)}
                className={`flex shrink-0 cursor-pointer items-center justify-between gap-6 rounded-full border-[1.5px] px-5 py-2.5 text-[15px] font-bold transition-all ${
                  i === n ? "border-ink bg-ink text-white" : "border-ink/25 hover:border-ink"
                }`}
              >
                <span>{x.label}</span>
                <span className="font-mono text-[11px] font-medium opacity-60">0{n + 1}</span>
              </button>
            ))}
          </div>
          <div>
            <div className="overflow-hidden rounded-[18px] border border-ink bg-night shadow-[8px_8px_0_#0b1218]">
              <div className="flex items-center gap-2 border-b border-night-line px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
                  <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
                  <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
                </span>
                <span className="font-mono text-[11.5px] text-fog-muted">resolveai / app / {s.id}</span>
              </div>
              <img key={s.src} src={s.src} alt={`ResolveAI ${s.label} view`} width={1600} height={900} loading="lazy" className="block h-auto w-full bg-cream" />
            </div>
            <p className="mt-5 max-w-[60ch] text-[16px] text-text-2">{s.text}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const PROOF = [
  { n: 33, label: "golden cases pass, including belief invalidation" },
  { n: 11, label: "red-team attacks blocked" },
  { n: 14, label: "of 14 replayed tickets right", suffix: "/14" },
  { n: 15, label: "policy rules gate every action" },
  { n: 0, label: "known vulnerabilities in production dependencies" },
];

function Proof() {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      el.querySelectorAll<HTMLElement>("[data-count]").forEach((node) => {
        const end = Number(node.dataset.count);
        const o = { v: 0 };
        gsap.to(o, {
          v: end,
          duration: 1.4,
          ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 85%", once: true },
          onUpdate: () => (node.textContent = String(Math.round(o.v))),
        });
      });
    });
    return () => mm.revert();
  }, []);
  return (
    <section id="proof" ref={wrap} className="mx-auto max-w-6xl px-6 py-28">
      <SectionHead marker="05" title={<>Numbers from the harness.</>} body="Every figure below is printed by npm run eval, npm test or npm audit. The cases run against simulated Paytm systems and synthetic tickets." />
      <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-5">
        {PROOF.map((p, i) => (
          <div key={p.label} className="reveal border-t-[1.5px] border-ink pt-4" style={{ ["--d" as string]: `${i * 70}ms` }}>
            <dt className="display text-[clamp(2.6rem,5vw,4rem)]">
              <span data-count={p.n}>{p.n}</span>
              {p.suffix}
            </dt>
            <dd className="mt-3 max-w-[22ch] text-[14px] leading-snug text-text-2">{p.label}</dd>
          </div>
        ))}
      </dl>
      <p className="reveal mt-10 max-w-[70ch] text-[13px] text-text-2">{t("proof.note")}</p>
    </section>
  );
}

function Languages() {
  const { t } = useI18n();
  const row = [...GREETINGS, ...GREETINGS];
  return (
    <section id="languages" className="overflow-hidden border-y border-ink/15 bg-white/50 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHead marker="06" title={<>{t("lang.title")}</>} body={t("lang.body")} />
      </div>
      <div className="mt-14 border-y border-ink/15 py-8" aria-hidden>
        <div className="marquee-track flex gap-14 font-display text-[clamp(2.6rem,6vw,4.6rem)] font-bold">
          {row.map((g, i) => (
            <span key={i} className="whitespace-nowrap">
              {g}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const CLIENTS = (origin: string) =>
  [
    { id: "claude", label: "Claude Code", cmd: `claude mcp add --transport http resolveai ${origin}/mcp` },
    { id: "cursor", label: "Cursor or Claude Desktop", cmd: `{ "mcpServers": { "resolveai": { "url": "${origin}/mcp" } } }` },
    { id: "local", label: "Local CLI", cmd: "claude mcp add resolveai -- npx tsx server/src/mcp/stdio.ts" },
  ] as const;

function Plugins() {
  const { t } = useI18n();
  const clients = CLIENTS(location.origin);
  const [active, setActive] = useState<string>("claude");
  const current = clients.find((c) => c.id === active) ?? clients[0];
  return (
    <section id="plugins" className="mx-auto max-w-6xl px-6 py-28">
      <SectionHead marker="07" title={<>{t("plug.title")}</>} body={t("plug.body")} />
      <div className="reveal mt-12 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div>
          <div role="tablist" aria-label="MCP clients" className="mb-3 flex flex-wrap gap-2">
            {clients.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={active === c.id}
                onClick={() => setActive(c.id)}
                className={`cursor-pointer rounded-full border-[1.5px] px-4 py-2 text-[14px] font-bold transition-all ${active === c.id ? "border-ink bg-ink text-white" : "border-ink/25 hover:border-ink"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <CopyBlock text={current.cmd} dark />
        </div>
        <RoomLink to="/app/plugins" className="btn-line self-start px-6 py-3 text-[15px] lg:justify-self-end">
          {t("plug.more")}
          <ArrowUpRight size={16} weight="bold" aria-hidden />
        </RoomLink>
      </div>
    </section>
  );
}

function Honest() {
  const { t } = useI18n();
  const real = ["Policy engine, signed one-time capabilities, verifier", "Belief invalidation on pending approvals", "Hash-chained audit log with published anchors", "Approver PINs and a two-person rule", "MCP server and Twilio WhatsApp channel code"];
  const simulated = ["Every Paytm system: ledger, bank, settlements, disputes", "Shadow tickets are synthetic", "Sarvam, translation and WhatsApp paths await live keys", "Business numbers are targets, not results"];
  return (
    <section id="honest" className="border-t border-ink/15 bg-white/50">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <SectionHead marker="08" title={<>{t("honest.title")}</>} body={t("honest.body")} />
        <div className="mt-12 grid gap-10 md:grid-cols-[1.3fr_1fr]">
          <div className="reveal rounded-[18px] border border-ink/15 bg-white p-7">
            <h3 className="font-display text-[22px] font-bold">Built and tested</h3>
            <ul className="mt-4 space-y-3 text-[16px]">
              {real.map((r) => (
                <li key={r} className="flex gap-3">
                  <i className="mt-2 h-2 w-2 shrink-0 rotate-45 bg-mintfill outline outline-1 outline-ink" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="reveal p-2" style={{ ["--d" as string]: "100ms" }}>
            <h3 className="font-display text-[22px] font-bold">Simulated or unproven</h3>
            <ul className="mt-4 space-y-3 text-[16px] text-text-2">
              {simulated.map((r) => (
                <li key={r} className="flex gap-3">
                  <i className="mt-2 h-2 w-2 shrink-0 rotate-45 border border-ink" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="reveal mt-24 flex flex-col items-start gap-8 border-t-[1.5px] border-ink pt-14 md:flex-row md:items-center md:justify-between">
          <h2 className="display max-w-[14ch] text-[clamp(2.6rem,6vw,4.6rem)]">{t("cta.title")}</h2>
          <RoomLink to="/app" className="btn-ink px-8 py-4 text-[17px]">
            {t("cta.btn")}
            <ArrowRight size={18} weight="bold" aria-hidden />
          </RoomLink>
        </div>
      </div>
    </section>
  );
}
