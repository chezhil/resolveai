import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { useI18n } from "./lib/i18n";
import { LangSwitch } from "./components/LangSwitch";
import { Plugins } from "./views/Plugins";
import type { Meta, Snapshot } from "./lib/api";
import { api } from "./lib/api";
import { useLive } from "./lib/store";
import { MetaContext } from "./lib/meta";
import { Console } from "./views/Console";
import { Merchant } from "./views/Merchant";
import { Approvals } from "./views/Approvals";
import { Cases } from "./views/Cases";
import { Evals } from "./views/Evals";
import { Audit } from "./views/Audit";
import { Impact } from "./views/Impact";
import { Analytics } from "./views/Analytics";
import { MetricsStrip } from "./components/MetricsStrip";
import { AppNavLink, useAppNavigate } from "./components/AppLink";
import { Button, Pill, cx } from "./components/ui";

interface Page {
  path: string;
  key: string;
}

const PAGES: Page[] = [
  { path: "/", key: "app.console" },
  { path: "/merchant", key: "app.phone" },
  { path: "/approvals", key: "app.approvals" },
  { path: "/cases", key: "app.cases" },
  { path: "/analytics", key: "app.analytics" },
  { path: "/evals", key: "app.evals" },
  { path: "/audit", key: "app.audit" },
  { path: "/impact", key: "app.impact" },
  { path: "/plugins", key: "app.plugins" },
];

export default function App() {
  const { snap, traces, lastAnnouncement, connected, hydrate } = useLive();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<string>();
  const go = useAppNavigate();

  useEffect(() => {
    api<Meta>("/meta").then(setMeta).catch(() => {});
  }, []);

  // Follow the newest case when one opens (only on change, so a case picked elsewhere stays selected).
  const newest = snap?.cases[0]?.id;
  const lastNewest = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (newest && newest !== lastNewest.current) setSelected(newest);
    lastNewest.current = newest;
  }, [newest]);

  useEffect(() => {
    if (selected && !traces[selected]) hydrate(selected);
  }, [selected]);

  if (!snap) {
    return (
      <div className="grid h-full place-items-center px-4">
        <div className="card p-6 text-center">
          <Logo />
          <p className="mt-3 text-sm text-muted">{connected ? "Loading…" : "Connecting to the ResolveAI server…"}</p>
        </div>
      </div>
    );
  }

  const openCase = (id: string) => {
    setSelected(id);
    go("/");
  };

  return (
    <MetaContext.Provider value={meta}>
      <div className="mx-auto max-w-[1600px] px-4 pb-10">
        <Header snap={snap} connected={connected} onReset={() => setSelected(undefined)} />
        <main>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <MetricsStrip snap={snap} />
                  <Console snap={snap} meta={meta} traces={traces} selected={selected} select={setSelected} />
                </>
              }
            />
            <Route path="/merchant" element={<Merchant snap={snap} meta={meta} live={lastAnnouncement} selected={selected} select={setSelected} />} />
            <Route path="/approvals" element={<Approvals snap={snap} open={openCase} />} />
            <Route path="/cases" element={<Cases snap={snap} open={openCase} />} />
            <Route path="/analytics" element={<Analytics snap={snap} meta={meta} />} />
            <Route path="/evals" element={<Evals llmAvailable={snap.providers.length > 0} />} />
            <Route path="/audit" element={<Audit version={snap.cases.reduce((s, c) => s + c.actions.length + c.steps, 0) + snap.approvals.length} />} />
            <Route
              path="/impact"
              element={
                <>
                  <MetricsStrip snap={snap} />
                  <Impact snap={snap} meta={meta} />
                </>
              }
            />
            <Route path="/plugins" element={<Plugins />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </main>
      </div>
    </MetaContext.Provider>
  );
}

function Header({ snap, connected, onReset }: { snap: Snapshot; connected: boolean; onReset: () => void }) {
  const { t } = useI18n();
  const [controlsOpen, setControlsOpen] = useState(false);
  const pending = snap.approvals.filter((a) => a.status === "PENDING").length;
  const brainLabel = snap.brain === "llm" ? `LLM · ${snap.providers.join(" → ") || "no key"}` : "Offline planner";

  return (
    <header className="z-30 -mx-4 mb-4 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur sticky top-0">
      <div className="flex items-center gap-x-4 gap-y-2">
        <Logo />
        <span className="hidden whitespace-nowrap font-mono text-sm font-bold sm:inline lg:hidden">{snap.nowLabel}</span>
        <span title={connected ? "Live" : "Disconnected"} className={cx("h-2.5 w-2.5 shrink-0 rounded-full border border-line lg:hidden", connected ? "bg-mint" : "bg-ember")} />
        <button
          onClick={() => setControlsOpen(!controlsOpen)}
          aria-expanded={controlsOpen}
          aria-controls="sim-controls"
          className="chunky ml-auto cursor-pointer rounded-[10px] bg-white px-2.5 py-1 text-[13px] font-semibold lg:hidden"
        >
          {controlsOpen ? "Close" : "Controls"}
        </button>
        <div id="sim-controls" className={cx("ml-auto hidden flex-wrap items-center gap-2 lg:flex")}>
          <SimControls snap={snap} brainLabel={brainLabel} onReset={onReset} />
          <LangSwitch />
          <span title={connected ? "Live" : "Disconnected"} className={cx("h-2.5 w-2.5 rounded-full", connected ? "bg-verified" : "bg-ember")} />
        </div>
      </div>
      {controlsOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 lg:hidden">
          <SimControls snap={snap} brainLabel={brainLabel} onReset={onReset} />
        </div>
      )}
      {snap.models?.status === "degraded" && <DegradedBanner snap={snap} />}
      <nav aria-label="Pages" className="scroll-thin mt-2 flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full border border-line bg-white p-0.5">
        {PAGES.map((p) => (
          <AppNavLink
            key={p.path}
            to={p.path}
            end={p.path === "/"}
            className={(active) =>
              cx("flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors", active ? "bg-ink text-white" : "text-text-2 hover:bg-cream")
            }
          >
            {t(p.key)}
            {p.path === "/approvals" && pending > 0 && (
              <span className="ml-1 rounded-full bg-rose px-1.5 text-[11px] text-ink" aria-label={`${pending} pending`}>
                {pending}
              </span>
            )}
          </AppNavLink>
        ))}
      </nav>
    </header>
  );
}

function SimControls({ snap, brainLabel, onReset }: { snap: Snapshot; brainLabel: string; onReset: () => void }) {
  // Jumping the clock while the agent is mid-case races its watchers and can leave a stale hand-off note.
  const working = snap.cases.some((c) => c.status === "IN_PROGRESS");
  return (
    <>
      <div className="chunky flex items-center gap-2 rounded-[10px] bg-white px-2.5 py-1">
        <span className="label text-muted">Sim clock</span>
        <span className="whitespace-nowrap font-mono text-sm font-bold sm:hidden lg:inline">{snap.nowLabel}</span>
        <Button size="sm" tone="sun" disabled={working} title={working ? "Wait for the agent to finish this step" : undefined} onClick={() => api("/clock/advance", { minutes: 10 })}>
          +10m
        </Button>
        <Button size="sm" tone="sun" disabled={working} title={working ? "Wait for the agent to finish this step" : undefined} onClick={() => api("/clock/advance", { minutes: 24 * 60 })}>
          +1 day
        </Button>
      </div>
      <select
        value={snap.config.brain}
        onChange={(e) => api("/config", { brain: e.target.value })}
        aria-label="Brain"
        className="chunky max-w-full cursor-pointer rounded-[10px] bg-white px-2 py-1.5 text-[13px] font-semibold"
        title="Which brain proposes actions. Policy, tools and verifier are the same either way."
      >
        <option value="auto">Brain: auto ({brainLabel})</option>
        <option value="llm" disabled={!snap.providers.length}>
          Brain: LLM ({snap.providers.join(" → ") || "no key"})
        </option>
        <option value="planner">Brain: offline planner</option>
      </select>
      <Toggle on={snap.config.shadow} label="Shadow" onClick={() => api("/config", { shadow: !snap.config.shadow })} />
      <Toggle on={snap.config.chaosModelOutage} label="Model outage" danger onClick={() => api("/config", { chaosModelOutage: !snap.config.chaosModelOutage })} />
      <Button size="sm" onClick={() => api("/reset", {}).then(onReset)}>
        Reset
      </Button>
    </>
  );
}

/** Shown while the models are down: the app keeps working on the deterministic planner. */
function DegradedBanner({ snap }: { snap: Snapshot }) {
  const r = snap.metrics.resilience;
  const retry = snap.models.retryAt ? new Date(snap.models.retryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
  return (
    <div role="status" className="mt-2 rounded-lg border border-line bg-sun/40 px-3 py-1.5 text-[12.5px]">
      <b>Degraded mode:</b> models unavailable, so the deterministic planner is running cases through the same policy engine and verifier.
      {retry ? ` Models retried at ${retry}.` : ""}
      {r && (r.degradedCases || r.failedSafe) ? (
        <span className="text-muted">
          {" "}
          · {r.degradedCases} on planner · {r.takeovers} taken over mid-case · {r.failedSafe} to humans
        </span>
      ) : null}
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="ResolveAI home">
      <svg viewBox="34 34 188 188" className="h-8 w-8 shrink-0 text-ink" aria-hidden="true">
        <path d="M200.3 98.8A78 78 0 1 1 157.2 55.7" fill="none" stroke="currentColor" strokeWidth="26" />
        <circle cx="183.2" cy="72.8" r="19" fill="currentColor" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight">ResolveAI</span>
      <span className="hidden xl:block">
        <Pill tone="ink">Track 3 · Autonomous AI teammate</Pill>
      </span>
    </Link>
  );
}

function Toggle({ on, label, onClick, danger }: { on: boolean; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx("chunky flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold", on ? (danger ? "bg-ember" : "bg-sky") : "bg-white")}
    >
      <span className={cx("relative h-4 w-7 rounded-full border border-line", on ? "bg-ink" : "bg-sand")}>
        <span className={cx("absolute top-[1px] h-2.5 w-2.5 rounded-full bg-white transition-all", on ? "left-3" : "left-[1px]")} />
      </span>
      {label}
    </button>
  );
}
