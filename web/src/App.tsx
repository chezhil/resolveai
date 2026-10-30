import { useEffect, useState } from "react";
import type { Meta } from "./lib/api";
import { api } from "./lib/api";
import { useLive } from "./lib/store";
import { Console } from "./views/Console";
import { Cases } from "./views/Cases";
import { Evals } from "./views/Evals";
import { Audit } from "./views/Audit";
import { Impact } from "./views/Impact";
import { Button, Pill, cx } from "./components/ui";

const TABS = ["Console", "Cases & approvals", "Evals & shadow", "Audit log", "Impact"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const { snap, traces, lastAnnouncement, connected, hydrate } = useLive();
  const [tab, setTab] = useState<Tab>("Console");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected && !traces[selected]) hydrate(selected);
  }, [selected]);

  if (!snap) {
    return (
      <div className="grid h-full place-items-center">
        <div className="card p-6 text-center">
          <Logo />
          <p className="mt-3 text-sm text-muted">{connected ? "Loading…" : "Connecting to the ResolveAI server on :8787…"}</p>
        </div>
      </div>
    );
  }

  const pending = snap.approvals.filter((a) => a.status === "PENDING").length;
  const brainLabel = snap.brain === "llm" ? `LLM · ${snap.providers.join(" → ") || "no key"}` : "Offline planner";

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-10">
      <header className="z-30 -mx-4 mb-4 border-b-2 border-ink bg-cream/95 px-4 py-2.5 backdrop-blur lg:sticky lg:top-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Logo />
          <nav className="scroll-thin order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 lg:order-none lg:w-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx("shrink-0 cursor-pointer whitespace-nowrap rounded-lg border-2 px-2.5 py-1 text-[13px] font-semibold", t === tab ? "border-ink bg-ink text-white" : "border-transparent hover:border-ink/30")}
              >
                {t}
                {t === "Cases & approvals" && pending > 0 && <span className="ml-1 rounded-full bg-rose px-1.5 text-[11px] text-ink">{pending}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="chunky flex items-center gap-2 rounded-xl bg-white px-2.5 py-1">
              <span className="label text-muted">Sim clock</span>
              <span className="font-mono text-sm font-bold">{snap.nowLabel}</span>
              <Button size="sm" tone="sun" onClick={() => api("/clock/advance", { minutes: 10 })}>
                +10m
              </Button>
              <Button size="sm" tone="sun" onClick={() => api("/clock/advance", { minutes: 24 * 60 })}>
                +1 day
              </Button>
            </div>
            <select
              value={snap.config.brain}
              onChange={(e) => api("/config", { brain: e.target.value })}
              className="chunky cursor-pointer rounded-xl bg-white px-2 py-1.5 text-[13px] font-semibold"
              title="Which brain proposes actions. Policy, tools and verifier are the same either way."
            >
              <option value="auto">Brain: auto ({brainLabel})</option>
              <option value="llm" disabled={!snap.providers.length}>
                Brain: Groq → Gemini
              </option>
              <option value="planner">Brain: offline planner</option>
            </select>
            <Toggle on={snap.config.shadow} label="Shadow" onClick={() => api("/config", { shadow: !snap.config.shadow })} />
            <Toggle on={snap.config.chaosModelOutage} label="Model outage" danger onClick={() => api("/config", { chaosModelOutage: !snap.config.chaosModelOutage })} />
            <Button size="sm" onClick={() => api("/reset", {}).then(() => setSelected(undefined))}>
              Reset
            </Button>
            <span title={connected ? "Live" : "Disconnected"} className={cx("h-2.5 w-2.5 rounded-full border border-ink", connected ? "bg-mint" : "bg-ember")} />
          </div>
        </div>
      </header>

      <MetricsStrip snap={snap} />

      {tab === "Console" && <Console snap={snap} meta={meta} traces={traces} live={lastAnnouncement} selected={selected} select={setSelected} />}
      {tab === "Cases & approvals" && (
        <Cases
          snap={snap}
          open={(id) => {
            setSelected(id);
            setTab("Console");
          }}
        />
      )}
      {tab === "Evals & shadow" && <Evals llmAvailable={snap.providers.length > 0} />}
      {tab === "Audit log" && <Audit version={snap.cases.reduce((s, c) => s + c.actions.length + c.steps, 0) + snap.approvals.length} />}
      {tab === "Impact" && <Impact snap={snap} meta={meta} />}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-sun font-bold shadow-[2px_2px_0_#121633]">✓</span>
      <span className="font-display text-xl font-extrabold tracking-tight">ResolveAI</span>
      <span className="hidden md:block">
        <Pill tone="brand">Track 3 · Autonomous AI teammate</Pill>
      </span>
    </div>
  );
}

function Toggle({ on, label, onClick, danger }: { on: boolean; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("chunky flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-[13px] font-semibold", on ? (danger ? "bg-ember" : "bg-sky") : "bg-white")}>
      <span className={cx("relative h-4 w-7 rounded-full border-2 border-ink", on ? "bg-ink" : "bg-sand")}>
        <span className={cx("absolute top-[1px] h-2.5 w-2.5 rounded-full bg-white transition-all", on ? "left-3" : "left-[1px]")} />
      </span>
      {label}
    </button>
  );
}

function MetricsStrip({ snap }: { snap: import("./lib/api").Snapshot }) {
  const m = snap.metrics;
  const items = [
    ["Cases", m.cases, "bg-white"],
    ["Verified closed", m.resolved, "bg-mint"],
    ["Auto-resolved", m.cases ? `${Math.round(m.autoResolveRate * 100)}%` : "—", "bg-sun"],
    ["Watching money", m.watching, "bg-sun"],
    ["Awaiting approval", m.awaitingApproval, "bg-rose"],
    ["Escalated w/ case file", m.escalated, "bg-ember"],
    ["Proactive", m.proactive, "bg-sky"],
    ["Missed deadlines", m.missedDisputeDeadlines, "bg-white"],
    ["Merchant CSAT", m.csat ? `${m.csat}★` : "—", "bg-white"],
  ] as const;
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
      {items.map(([k, v, tone]) => (
        <div key={k} className={cx("rounded-xl border-2 border-ink px-3 py-1.5", tone)}>
          <div className="font-display text-xl font-extrabold leading-tight">{v}</div>
          <div className="text-[11px] font-semibold leading-tight">{k}</div>
        </div>
      ))}
    </div>
  );
}
