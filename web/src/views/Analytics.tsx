import { useState } from "react";
import type { Meta, Snapshot } from "../lib/api";
import { api } from "../lib/api";
import {
  ACTION_LABEL,
  CATEGORY_LABEL,
  WORKFLOW_LABEL,
  accuracyByWorkflow,
  goldenByCategory,
  goldenLatency,
  humanDuration,
  pct,
  sessionStats,
  summarise,
  useEvalReport,
  type ProofSummary,
  type ShadowRow,
} from "../lib/analytics";
import { CORAL, ChartCard, Donut, Dumbbell, GREY, HBars, INK, MINT, MiniBars, PairBars, PassBars, SKY, SUN, Stat } from "../components/charts";
import { Button, Empty, Pill, cx } from "../components/ui";

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function Analytics({ snap, meta }: { snap: Snapshot; meta: Meta | null }) {
  const { data, loading, error, reload } = useEvalReport();
  const proof = data ? summarise(data) : null;

  return (
    <div className="space-y-5">
      <Hero loading={loading} onRerun={reload} proof={proof} />
      <JumpNav />
      {error && (
        <div role="alert" className="card border-bad/40 bg-rose/40 p-4 text-sm">
          The evidence run failed: {error}. <button className="font-bold underline" onClick={reload}>Try again</button>
        </div>
      )}
      {!data && !error && <SkeletonBand />}
      {data && proof && (
        <>
          <section id="proof" aria-label="Headline numbers" className="scroll-mt-28 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat tone="mint" big={`${proof.agentCorrect}/${proof.tickets}`} label="right calls by the agent" sub={`Human agents on the same tickets: ${proof.humanCorrect}/${proof.tickets} (${pct(proof.humanCorrect, proof.tickets)}%)`} />
            <Stat tone="white" big={<span className="text-[27px] sm:whitespace-nowrap sm:text-[36px]">{humanDuration(proof.medianHumanMinutes)} → {humanDuration(proof.medianAgentMinutes)}</span>} label="median time to a decision" sub="Human on the historical ticket, then the agent on the simulated clock (not time until the money lands)" />
            <Stat tone="sky" big={proof.contactsAvoided} label="back-and-forth contacts avoided" sub={`${proof.humanContactsTotal} contacts across the ${proof.tickets} tickets, ${proof.tickets} with the agent`} />
            <Stat tone="white" big={`${proof.goldenPassed}/${proof.goldenTotal}`} label="golden cases pass" sub={`${proof.checksPassed} of ${proof.checksTotal} individual checks`} />
            <Stat tone="ink" big={`${proof.redTeamPassed}/${proof.redTeamTotal}`} label="red-team attacks contained" sub="Forged, replayed and flooded requests; leaks; history rewrites" />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              kicker="Replay · 14 historical tickets"
              title="Time to a decision, ticket by ticket"
              right={<span className="hidden text-[12px] font-semibold text-muted sm:block">log scale · lower is faster</span>}
              note="Human time is how long the historical ticket took to reach an action. Agent time is how long the agent took, on the simulated clock, to propose the right action in shadow mode. This is time to a decision, not time until the money lands (that is the watcher and verifier, shown in the console). A coral ring means the human's action was the wrong one."
            >
              <div className="scroll-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label="Time to a decision chart (scrolls sideways on a narrow screen)">
                <div className="min-w-[620px]">
                  <Dumbbell rows={data.shadow.rows.map((r) => ({ id: r.id, label: WORKFLOW_LABEL[r.workflow] ?? r.workflow, human: r.humanMinutes, agent: r.agentSeconds / 60, humanWrong: !r.humanCorrect }))} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-semibold text-text-2">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: GREY }} />Human agent</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-ink" style={{ background: MINT }} />ResolveAI</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border-[3px]" style={{ borderColor: CORAL, background: GREY }} />Human got it wrong</span>
              </div>
            </ChartCard>
            <ChartCard kicker="Replay · by workflow" title="Right call, by workflow" note="A call is right when the proposed action matches what the SOP says should happen, as labelled by the ops reviewer.">
              <PairBars aName="ResolveAI" bName="Human agent" rows={accuracyByWorkflow(data.shadow.rows).map((w) => ({ label: WORKFLOW_LABEL[w.workflow] ?? w.workflow, a: w.agent, b: w.human, of: w.tickets }))} />
            </ChartCard>
          </section>

          <HumanMisses rows={proof.humanErrors} />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard kicker="Golden suite" title="Every guarantee has a test" note="Each bar segment is one case. A single failing case turns its segment coral. The suite runs against the same tools, policy engine and verifier as the live agent.">
              <PassBars rows={goldenByCategory(data.golden).map((c) => ({ label: CATEGORY_LABEL[c.category] ?? c.category, passed: c.passed, total: c.total, accent: c.category === "red-team" }))} />
            </ChartCard>
            <ChartCard kicker="Speed of the loop" title="The agent loop itself is cheap" note="Compute time per golden case on the offline planner with demo pacing off. It excludes model latency, which depends on the provider.">
              <Latency g={goldenLatency(data.golden)} all={data.golden.map((x) => x.ms)} />
            </ChartCard>
            <ChartCard kicker="Safety" title="What the policy engine refuses" note="Each row is one golden case that asserts the refusal. The full list is on the Evals page.">
              <Refusals golden={data.golden} />
            </ChartCard>
          </section>
        </>
      )}

      <SessionPanel snap={snap} meta={meta} />

      {data && proof && (
        <>
          <WhyUse proof={proof} categories={goldenByCategory(data.golden)} rows={data.shadow.rows} />
          <Method />
        </>
      )}
    </div>
  );
}

function Hero({ loading, onRerun, proof }: { loading: boolean; onRerun: () => void; proof: ProofSummary | null }) {
  return (
    <header className="card flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        <div className="label text-muted">Analytics &amp; proof</div>
        <h1 className="mt-1 font-display text-[30px] font-semibold leading-[1.05] tracking-tight sm:text-[40px]">Does it actually work? The evidence, computed live.</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-2">
          Nothing on this page is typed in. It is calculated from the running system: a replay of 14 historical tickets against what human agents did, a {proof ? proof.goldenTotal : 35}-case golden suite that includes red-team attacks, and the cases in this session.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone="mint">Deterministic planner</Pill>
          <Pill tone="sun">Synthetic tickets</Pill>
          <Pill tone="white">Same policy as the live agent</Pill>
        </div>
      </div>
      <Button tone="ink" onClick={onRerun} disabled={loading}>
        {loading ? "Running the evidence…" : "Re-run the evidence"}
      </Button>
    </header>
  );
}

function JumpNav() {
  const items: [string, string][] = [
    ["proof", "Proof"],
    ["misses-h", "Where humans erred"],
    ["session-h", "This session"],
    ["why-h", "Why use it"],
    ["method", "Method and limits"],
  ];
  return (
    <nav aria-label="On this page" className="scroll-thin -mt-2 flex gap-1.5 overflow-x-auto pb-1">
      {items.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="chunky shrink-0 rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-text-2 hover:bg-ink hover:text-white"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function SkeletonBand() {
  return (
    <div aria-busy="true" aria-label="Running the evidence" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[132px] animate-pulse rounded-[16px] border border-line bg-paper-2" />
      ))}
    </div>
  );
}

function HumanMisses({ rows }: { rows: ShadowRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="misses-h" className="scroll-mt-28">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="misses-h" className="font-display text-[22px] font-semibold tracking-tight">
          Where the human call was wrong, and what the agent did instead
        </h2>
        <span className="text-[12.5px] text-muted">{rows.length} of 14 replay tickets</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => (
          <article key={r.id} className="card flex flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] font-bold">{r.id}</span>
              <Pill tone="rose">{WORKFLOW_LABEL[r.workflow] ?? r.workflow}</Pill>
            </div>
            <p className="text-[13px] leading-snug">
              <span className="label mr-1 text-muted">Human</span>
              <b>{ACTION_LABEL[r.humanAction] ?? r.humanAction}</b>
            </p>
            <p className="text-[13px] leading-snug">
              <span className="label mr-1 text-ok">ResolveAI</span>
              <b>{r.agentProposed.map((a) => ACTION_LABEL[a] ?? a.replaceAll("_", " ")).filter((a) => a !== "send message").join(", ")}</b>
            </p>
            {r.note && <p className="mt-auto border-t border-line pt-2 text-[12px] leading-snug text-muted">{r.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Latency({ g, all }: { g: { p50: number; p95: number; max: number }; all: number[] }) {
  const fmt = (ms: number) => (ms < 10 ? `${ms.toFixed(1)} ms` : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        ["p50", g.p50],
        ["p95", g.p95],
        ["slowest", g.max],
      ].map(([k, v]) => (
        <div key={String(k)} className="rounded-[12px] border border-line bg-paper-2 p-3">
          <div className="font-display text-[24px] font-semibold leading-none">{fmt(Number(v))}</div>
          <div className="label mt-1.5 text-muted">{k}</div>
        </div>
      ))}
      <div className="col-span-3 mt-3">
        <div className="label mb-1 text-muted">Every golden case, sorted by duration</div>
        <MiniBars values={all} label="Golden case duration" />
      </div>
    </div>
  );
}

function Refusals({ golden }: { golden: { id: string; title: string; pass: boolean }[] }) {
  const pick: [string, string][] = [
    ["R01", "Forged tool call"],
    ["R02", "Replayed capability"],
    ["G14", "Prompt injection in a message"],
    ["G16", "Forged approval event"],
    ["G06", "Payout change by chat (social engineering)"],
    ["R11", "Message leaking an account number"],
  ];
  const by = new Map(golden.map((g) => [g.id, g]));
  const rows = pick.flatMap(([id, label]) => {
    const g = by.get(id);
    return g ? [{ id, label, ok: g.pass }] : [];
  });
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-[13px]">
          <span className="font-semibold">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted">{r.id}</span>
            <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-bold", r.ok ? "border-ok/30 bg-mint text-ok" : "border-bad/40 bg-ember text-ink")}>{r.ok ? "refused" : "FAILED"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_SLICES: { key: string; label: string; color: string }[] = [
  { key: "RESOLVED", label: "Verified & closed", color: MINT },
  { key: "WATCHING", label: "Watching the money", color: SUN },
  { key: "AWAITING_APPROVAL", label: "Awaiting approval", color: "#f3a99b" },
  { key: "ESCALATED", label: "Escalated with case file", color: CORAL },
  { key: "FAILED_SAFE", label: "Failed safe to a human", color: "#c98a7d" },
  { key: "IN_PROGRESS", label: "Working", color: SKY },
  { key: "OPEN", label: "Shadow · human queue", color: GREY },
];

function SessionPanel({ snap, meta }: { snap: Snapshot; meta: Meta | null }) {
  const s = sessionStats(snap);
  const [busy, setBusy] = useState(false);
  const runAll = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      for (const sc of meta.scenarios) {
        await api(`/scenarios/${sc.id}`, {}).catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setBusy(false);
    }
  };
  const verdictRows = [
    ["ALLOW", "Allowed within limits", MINT],
    ["NEEDS_APPROVAL", "Sent for approval", "#f3a99b"],
    ["BLOCK", "Blocked by policy", CORAL],
    ["ESCALATE", "Escalated to a human", "#c98a7d"],
    ["SHADOW", "Recorded, not executed", GREY],
  ] as const;
  return (
    <section aria-labelledby="session-h" className="scroll-mt-28 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-muted">This session · live</div>
          <h2 id="session-h" className="font-display text-[22px] font-semibold tracking-tight">
            What the agent is doing right now
          </h2>
        </div>
        <Button tone="sun" disabled={busy || !meta} onClick={runAll}>
          {busy ? "Running scenarios…" : s.cases ? "Run the demo scenarios again" : "Run all demo scenarios"}
        </Button>
      </div>
      {!s.cases ? (
        <Empty>
          No cases yet in this room. Run the demo scenarios to fill these charts with real agent decisions, or start one yourself from the Console.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard kicker="Autonomy" title="Where every case ended up" note={`${s.autonomousPct}% closed without a human touching them. ${snap.metrics.proactive ? `${snap.metrics.proactive} opened before the merchant complained.` : ""}`}>
            <Donut label="Case outcomes" big={`${s.autonomousPct}%`} small="autonomous" slices={STATUS_SLICES.map((x) => ({ label: x.label, value: s.status[x.key] ?? 0, color: x.color }))} />
          </ChartCard>
          <ChartCard kicker="Policy" title="What the policy engine decided" note="Every proposed action passes through the deterministic engine. The model suggests; policy decides.">
            <HBars rows={verdictRows.map(([k, label, color]) => ({ label, value: s.verdicts[k] ?? 0, color }))} />
            <div className="mt-4 grid grid-cols-4 gap-1.5 text-center">
              {(["L0", "L1", "L2", "L3"] as const).map((l) => (
                <div key={l} className="rounded-[10px] border border-line bg-paper-2 py-1.5">
                  <div className="font-display text-[20px] font-semibold leading-none">{s.levels[l] ?? 0}</div>
                  <div className="label mt-1 text-muted">{l}</div>
                </div>
              ))}
            </div>
          </ChartCard>
          <ChartCard kicker="Mix" title="Cases by workflow" note={s.tat.met + s.tat.running + s.tat.breached ? `RBI turnaround clock: ${s.tat.met} met, ${s.tat.running} running, ${s.tat.breached} breached.` : undefined}>
            <HBars rows={s.workflows.map((w) => ({ label: WORKFLOW_LABEL[w.workflow] ?? w.workflow, value: w.count, color: INK }))} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[10px] border border-line bg-rose/50 p-3">
                <div className="font-display text-[20px] font-semibold leading-none">{rupees(s.amountAwaitingApproval)}</div>
                <div className="mt-1 text-[11.5px] font-semibold">waiting on a human</div>
              </div>
              <div className="rounded-[10px] border border-line bg-mint/60 p-3">
                <div className="font-display text-[20px] font-semibold leading-none">{s.csatAvg ? `${s.csatAvg.toFixed(1)}★` : "—"}</div>
                <div className="mt-1 text-[11.5px] font-semibold">merchant rating</div>
              </div>
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}

type Mark = "yes" | "part" | "no";
const MARK: Record<Mark, { cls: string; sr: string }> = {
  yes: { cls: "text-ok", sr: "Yes" },
  part: { cls: "text-warn", sr: "Partly" },
  no: { cls: "text-bad", sr: "No" },
};

function MarkIcon({ m }: { m: Mark }) {
  return (
    <>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={cx("mx-auto", MARK[m].cls)}>
        <circle cx="8" cy="8" r="6" fill={m === "yes" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
        {m === "part" && <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />}
      </svg>
      <span className="sr-only">{MARK[m].sr}</span>
    </>
  );
}

function WhyUse({ proof, categories, rows }: { proof: ProofSummary; categories: { category: string; total: number; passed: number }[]; rows: ShadowRow[] }) {
  const cat = (c: string) => categories.find((x) => x.category === c);
  const ev = (c: string) => {
    const x = cat(c);
    return x ? `${x.passed}/${x.total} ${CATEGORY_LABEL[c]?.toLowerCase() ?? c} cases pass` : "";
  };
  const matrix: { need: string; bot: Mark; human: Mark; ai: Mark; evidence: string }[] = [
    { need: "Answers a policy question", bot: "yes", human: "yes", ai: "yes", evidence: "Read-only lookups, level L0" },
    { need: "Looks across ledger, Paytm PG, bank and UDIR", bot: "no", human: "part", ai: "yes", evidence: ev("workflow") },
    { need: "Takes the fix: bank ticket, release, dispute evidence", bot: "no", human: "yes", ai: "yes", evidence: "Within limits; above them, one-click approval" },
    { need: "Confirms the money moved before closing", bot: "no", human: "part", ai: "yes", evidence: "Verifier re-reads the ledger (G02)" },
    { need: "Refuses unsafe requests", bot: "part", human: "part", ai: "yes", evidence: `${proof.redTeamPassed}/${proof.redTeamTotal} attacks contained; humans wrong on ${proof.humanErrors.length} of ${proof.tickets} replay tickets` },
    { need: "Tamper-evident record of every action", bot: "no", human: "no", ai: "yes", evidence: "Hash chain plus published anchors (R09)" },
    { need: "Keeps working when the AI models are down", bot: "no", human: "no", ai: "yes", evidence: ev("resilience") },
    { need: "Understands Kannada, Hindi and English, incl. voice notes", bot: "part", human: "part", ai: "yes", evidence: "Kannada voice-note case (G01); Hindi and English in the demo scenarios" },
    { need: "Reaches out before the merchant complains", bot: "no", human: "no", ai: "yes", evidence: ev("proactive") },
  ];
  const slow = [...rows].filter((r) => r.workflow === "failed_payment").sort((a, b) => a.humanMinutes - b.humanMinutes)[Math.floor(rows.filter((r) => r.workflow === "failed_payment").length / 2)];
  return (
    <section aria-labelledby="why-h" className="scroll-mt-28 space-y-3">
      <div>
        <div className="label text-muted">Why teams would use it</div>
        <h2 id="why-h" className="font-display text-[22px] font-semibold tracking-tight">
          Everyone helps today. Nobody finishes.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard className="xl:col-span-3" kicker="Capability" title="What each option can actually do" note="The ResolveAI column links to the evidence above where it can be measured. The chatbot and human-agent columns describe the typical setup, not a measurement of any product.">
          <div className="scroll-thin relative overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
              <thead>
                <tr className="label text-muted">
                  <th scope="col" className="pb-2 pr-3 font-medium">Need</th>
                  <th scope="col" className="w-20 pb-2 text-center font-medium">FAQ bot</th>
                  <th scope="col" className="w-20 pb-2 text-center font-medium">Human, 5 tabs</th>
                  <th scope="col" className="w-20 rounded-t-[10px] bg-mint pb-2 pt-1 text-center font-bold text-ink">ResolveAI</th>
                  <th scope="col" className="pb-2 pl-4 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r, i) => (
                  <tr key={r.need}>
                    <th scope="row" className="border-t border-line py-2.5 pr-3 font-semibold">{r.need}</th>
                    {[r.bot, r.human].map((m, j) => (
                      <td key={j} className="border-t border-line py-2.5">
                        <MarkIcon m={m} />
                      </td>
                    ))}
                    <td className={cx("border-t border-line bg-mint/60 py-2.5", i === matrix.length - 1 && "rounded-b-[10px]")}>
                      <MarkIcon m={r.ai} />
                    </td>
                    <td className="border-t border-line py-2.5 pl-4 text-[12px] leading-snug text-muted">{r.evidence || "See the Evals page"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex items-center gap-4 text-[11.5px] text-muted"><span className="flex items-center gap-1.5"><MarkIcon m="yes" /> yes</span><span className="flex items-center gap-1.5"><MarkIcon m="part" /> partly</span><span className="flex items-center gap-1.5"><MarkIcon m="no" /> no</span></p>
        </ChartCard>
        <ChartCard className="xl:col-span-2" kicker="One merchant's day" title="A silent soundbox, two ways" note="Taken from a failed-payment ticket in the replay. Human minutes are from the historical ticket; the agent's are simulated-clock seconds to a decision.">
          {slow ? <Journey row={slow} /> : <Empty>No failed-payment ticket in the replay.</Empty>}
        </ChartCard>
      </div>
    </section>
  );
}

function Journey({ row }: { row: ShadowRow }) {
  const steps = [
    {
      who: "Today",
      tone: "bg-paper-2",
      dot: GREY,
      time: humanDuration(row.humanMinutes),
      contacts: row.humanContacts,
      lines: [`${row.humanContacts} contacts between merchant, support and the bank`, "Five systems checked by hand, in separate tabs", "Merchant waits for a call back"],
    },
    {
      who: "ResolveAI",
      tone: "bg-mint/60",
      dot: MINT,
      time: humanDuration(row.agentSeconds / 60),
      contacts: row.agentContacts,
      lines: [`${row.agentContacts} contact: the merchant messages once, in their own language`, "Ledger, Paytm PG, bank and UDIR correlated in one pass", "A watcher re-checks the bank, tells the payer not to pay twice, and closes only when the money moved"],
    },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.who} className={cx("rounded-[14px] border border-line p-3.5", s.tone)}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 font-display text-[16px] font-semibold">
              <i className="h-3 w-3 rounded-full border border-ink" style={{ background: s.dot }} />
              {s.who}
            </span>
            <span className="font-display text-[26px] font-semibold leading-none">{s.time}</span>
          </div>
          <div className="mt-2 flex items-center gap-1" aria-label={`${s.contacts} contact${s.contacts === 1 ? "" : "s"}`}>
            {Array.from({ length: s.contacts }).map((_, i) => (
              <i key={i} className="h-2.5 w-2.5 rounded-full border border-ink" style={{ background: s.dot }} />
            ))}
            <span className="label ml-1 text-muted">contacts</span>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-text-2">
            {s.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Method() {
  return (
    <details id="method" className="card group scroll-mt-28 p-5 text-[13.5px] leading-relaxed text-text-2">
      <summary className="cursor-pointer list-none font-display text-[18px] font-semibold text-ink">
        Method and limits <span className="ml-1 text-[13px] font-normal text-muted group-open:hidden">(read before quoting any number)</span>
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><b>The tickets are synthetic.</b> The 14-ticket replay stands in for the anonymised tickets we would ask Paytm for. The human baseline is what those tickets say a human did, and a reviewer labelled the right action, so treat the percentages as a method demonstration, not a measured production result.</li>
        <li><b>The agent brain here is the deterministic planner.</b> The planner was written against these workflows, so it is expected to do well on them. The LLM path runs through the same tools, policy and verifier, but only when a model key is configured.</li>
        <li><b>Time is time to a decision.</b> Agent seconds are on the simulated clock in shadow mode. Closing a case still waits for the real bank or settlement event, which the watcher and verifier handle.</li>
        <li><b>Small samples.</b> 14 replay tickets cannot support a confidence interval. The next step is a 30-day shadow pilot on real tickets.</li>
        <li><b>Everything on this page is recomputed</b> when you press “Re-run the evidence”, from the same code the CI runs.</li>
      </ul>
    </details>
  );
}
