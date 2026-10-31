// Landing page. Design read: fintech AI product page for hackathon judges, Paytm-ecosystem merchants and
// investors; dark "ledger" language, one cyan accent, motion only where it explains (the loop, section reveals).
// Dials: variance 7, motion 6, density 4. One theme (dark), one radius system (cards 16, controls 10).

import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Plugs, SealCheck, ShieldCheck, Translate } from "@phosphor-icons/react";
import { useI18n } from "../lib/i18n";
import { useReveal } from "../lib/reveal";
import { LangSwitch } from "../components/LangSwitch";
import { Pipeline } from "../components/Pipeline";
import { CopyBlock } from "./Plugins";

const STAGES = ["hear", "plan", "check", "act", "verify"] as const;

const REDLINES = [
  { id: "P1", text: "A payout account is never changed from a chat." },
  { id: "P3", text: "No action without a fact the ledger confirmed." },
  { id: "P6", text: "No account number, PAN, Aadhaar or phone in any outgoing message." },
  { id: "P10", text: "A message that tries to instruct the agent forces a human approval." },
  { id: "P13", text: "Above ₹1,00,000, two different people must approve." },
];

const GREETINGS = ["नमस्ते", "ನಮಸ್ಕಾರ", "வணக்கம்", "నమస్కారం", "नमस्कार", "নমস্কার", "નમસ્તે", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "നമസ്കാരം", "ନମସ୍କାର", "Hello"];

export function Landing() {
  const { t } = useI18n();
  const root = useReveal<HTMLDivElement>();

  return (
    <div ref={root} className="landing">
      <div className="ledger-bg" aria-hidden />
      <Nav />
      <main>
        <Hero />
        <Proof />
        <How />
        <Console />
        <Safety />
        <Languages />
        <Plugins />
        <Honest />
        <FinalCta />
      </main>
      <footer className="border-t border-night-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[13px] text-fog-muted">
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
    <header className="sticky top-0 z-30 border-b border-night-line bg-night/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="ResolveAI home">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-cyan text-sm font-bold text-night">R</span>
          <span className="text-lg font-semibold tracking-tight">ResolveAI</span>
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-6 text-[14px] text-fog-muted md:flex">
          <a className="hover:text-fog" href="#how">
            {t("nav.how")}
          </a>
          <a className="hover:text-fog" href="#safety">
            {t("nav.safety")}
          </a>
          <a className="hover:text-fog" href="#languages">
            {t("nav.languages")}
          </a>
          <a className="hover:text-fog" href="#plugins">
            {t("nav.plugins")}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangSwitch dark />
          <Link to="/app" className="btn-primary hidden items-center gap-1.5 whitespace-nowrap px-4 py-2 text-[14px] sm:inline-flex">
            {t("nav.cta")}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.15fr_0.85fr] lg:pt-12">
      <div>
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
          <span className="reveal block" style={{ ["--d" as string]: "0ms" }}>
            {t("hero.l1")}
          </span>
          <span className="reveal block text-cyan" style={{ ["--d" as string]: "120ms" }}>
            {t("hero.l2")}
          </span>
        </h1>
        <p className="reveal mt-6 max-w-[48ch] text-lg leading-relaxed text-fog-muted" style={{ ["--d" as string]: "240ms" }}>
          {t("hero.sub")}
        </p>
        <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ ["--d" as string]: "360ms" }}>
          <Link to="/app" className="btn-primary inline-flex items-center gap-2 whitespace-nowrap px-6 py-3 text-[15px]">
            {t("hero.cta1")}
            <ArrowRight size={18} weight="bold" aria-hidden />
          </Link>
          <a href="#safety" className="btn-ghost inline-flex items-center whitespace-nowrap px-6 py-3 text-[15px]">
            {t("hero.cta2")}
          </a>
        </div>
      </div>
      <div className="reveal flex justify-center lg:justify-end" style={{ ["--d" as string]: "300ms" }}>
        <Pipeline />
      </div>
    </section>
  );
}

function Proof() {
  const { t } = useI18n();
  const items = [
    ["32", "proof.cases"],
    ["11", "proof.redteam"],
    ["14/14", "proof.shadow"],
    ["15", "proof.rules"],
  ] as const;
  return (
    <section className="border-y border-night-line bg-night-2/60">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {items.map(([n, k], i) => (
            <div key={k} className="reveal" style={{ ["--d" as string]: `${i * 80}ms` }}>
              <dt className="font-mono text-4xl font-medium tracking-tight text-fog md:text-5xl">{n}</dt>
              <dd className="mt-2 max-w-[22ch] text-[14px] leading-snug text-fog-muted">{t(k)}</dd>
            </div>
          ))}
        </dl>
        <p className="reveal mt-8 max-w-[70ch] text-[13px] text-fog-muted">{t("proof.note")}</p>
      </div>
    </section>
  );
}

function How() {
  const { t } = useI18n();
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-24">
      <h2 className="reveal max-w-[18ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("how.title")}</h2>
      <ol className="mt-14 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-5">
        {STAGES.map((s, i) => (
          <li key={s} className="reveal border-t border-night-line pt-5" style={{ ["--d" as string]: `${i * 90}ms` }}>
            <h3 className="text-xl font-semibold">{t(`how.${s}`)}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-fog-muted">{t(`how.${s}.d`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Console() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <figure className="reveal overflow-hidden rounded-2xl border border-night-line bg-night-2">
        <img
          src="/shots/console.png"
          alt="The ResolveAI live console: the agent trace in the middle, the merchant phone on the left and the case file on the right"
          width={1600}
          height={900}
          loading="lazy"
          className="block h-auto w-full"
          onError={(e) => ((e.currentTarget.closest("figure") as HTMLElement).style.display = "none")}
        />
      </figure>
    </section>
  );
}

function Safety() {
  const { t } = useI18n();
  return (
    <section id="safety" className="bg-night-2/60">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <ShieldCheck size={36} weight="duotone" className="reveal text-cyan" aria-hidden />
          <h2 className="reveal mt-5 text-3xl font-semibold leading-[1.1] tracking-tight md:text-5xl">{t("safety.title")}</h2>
          <p className="reveal mt-6 max-w-[52ch] text-lg leading-relaxed text-fog-muted">{t("safety.body")}</p>
        </div>
        <div className="reveal">
          <h3 className="text-[15px] font-semibold text-fog">{t("safety.redline")}</h3>
          <ul className="mt-4 divide-y divide-night-line rounded-2xl border border-night-line bg-night">
            {REDLINES.map((r) => (
              <li key={r.id} className="flex items-baseline gap-4 px-5 py-4">
                <span className="w-10 shrink-0 font-mono text-[13px] text-cyan">{r.id}</span>
                <span className="text-[15px] leading-snug text-fog">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Languages() {
  const { t } = useI18n();
  const row = [...GREETINGS, ...GREETINGS];
  return (
    <section id="languages" className="overflow-hidden py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Translate size={36} weight="duotone" className="reveal text-cyan" aria-hidden />
        <h2 className="reveal mt-5 max-w-[20ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("lang.title")}</h2>
        <p className="reveal mt-6 max-w-[56ch] text-lg leading-relaxed text-fog-muted">{t("lang.body")}</p>
      </div>
      <div className="mt-14 border-y border-night-line py-8" aria-hidden>
        <div className="marquee-track flex gap-14 text-4xl font-medium text-fog md:text-6xl">
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
    <section id="plugins" className="bg-night-2/60">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-[1fr_1fr]">
        <div>
          <Plugs size={36} weight="duotone" className="reveal text-cyan" aria-hidden />
          <h2 className="reveal mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{t("plug.title")}</h2>
          <p className="reveal mt-6 max-w-[52ch] text-lg leading-relaxed text-fog-muted">{t("plug.body")}</p>
          <Link to="/app/plugins" className="reveal mt-8 inline-flex items-center gap-2 text-[15px] font-semibold text-cyan hover:underline">
            {t("plug.more")}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        </div>
        <div className="reveal self-center">
          <div role="tablist" aria-label="MCP clients" className="mb-3 flex flex-wrap gap-2">
            {clients.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={active === c.id}
                onClick={() => setActive(c.id)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active === c.id ? "border-cyan bg-cyan/10 text-cyan" : "border-night-line text-fog-muted hover:text-fog"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <CopyBlock text={current.cmd} dark />
        </div>
      </div>
    </section>
  );
}

function Honest() {
  const { t } = useI18n();
  const real = ["Policy engine, signed one-time capabilities, verifier", "Hash-chained audit log with published anchors", "Approver PINs and a two-person rule", "MCP server and Twilio WhatsApp channel code"];
  const simulated = ["Every Paytm system: ledger, bank, settlements, disputes", "Shadow tickets are synthetic", "Sarvam and WhatsApp paths await live keys", "Business numbers are targets, not results"];
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <h2 className="reveal max-w-[24ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("honest.title")}</h2>
      <p className="reveal mt-6 max-w-[60ch] text-lg leading-relaxed text-fog-muted">{t("honest.body")}</p>
      <div className="mt-12 grid gap-10 md:grid-cols-[1.3fr_1fr]">
        <div className="reveal">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <SealCheck size={20} weight="fill" className="text-verified" aria-hidden />
            Built and tested
          </h3>
          <ul className="mt-4 space-y-3 text-[15px] text-fog">
            {real.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="reveal" style={{ ["--d" as string]: "120ms" }}>
          <h3 className="text-[15px] font-semibold">Simulated or unproven</h3>
          <ul className="mt-4 space-y-3 text-[15px] text-fog-muted">
            {simulated.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="border-t border-night-line bg-night-2/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-24 md:flex-row md:items-center md:justify-between">
        <h2 className="reveal max-w-[20ch] text-3xl font-semibold tracking-tight md:text-5xl">{t("cta.title")}</h2>
        <Link to="/app" className="btn-primary reveal inline-flex items-center gap-2 whitespace-nowrap px-7 py-3.5 text-base">
          {t("cta.btn")}
          <ArrowRight size={18} weight="bold" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
