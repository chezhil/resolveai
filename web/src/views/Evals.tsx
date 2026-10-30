import { useState } from "react";
import { api } from "../lib/api";
import { Button, Empty, LevelBadge, Pill, SectionLabel, cx } from "../components/ui";

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}
interface Golden {
  id: string;
  title: string;
  category: string;
  pass: boolean;
  checks: Check[];
  status?: string;
  maxLevel?: "L0" | "L1" | "L2" | "L3";
  toolCalls: string[];
  ms: number;
}
interface ShadowRow {
  id: string;
  workflow: string;
  humanAction: string;
  gold: string;
  agentProposed: string[];
  agrees: boolean;
  correct: boolean;
  humanCorrect: boolean;
  note?: string;
  humanMinutes: number;
  agentSeconds: number;
  humanContacts: number;
}
interface Result {
  brain: string;
  golden: Golden[];
  shadow: { rows: ShadowRow[]; agreement: number; agentCorrect: number; humanCorrect: number; medianHumanMinutes: number; contactsAvoided: number };
}

export function Evals({ llmAvailable }: { llmAvailable: boolean }) {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const run = async (brain: "planner" | "llm") => {
    setBusy(true);
    setErr("");
    try {
      setRes(await api<Result>("/evals/run", { brain }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const passed = res?.golden.filter((g) => g.pass).length ?? 0;
  const red = res?.golden.filter((g) => g.category === "red-team") ?? [];

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="label text-muted">Learns safely · test before it acts</div>
          <div className="font-display text-xl font-extrabold">Golden-case evals + shadow replay on past tickets</div>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            Each case runs in a fresh, isolated world. Assertions read the ledger, settlement and dispute systems, not the agent's own words. The same suite runs in CI on every push.
          </p>
        </div>
        <div className="flex gap-2">
          <Button tone="brand" disabled={busy} onClick={() => run("planner")}>
            {busy ? "Running…" : "Run with offline planner"}
          </Button>
          <Button tone="sun" disabled={busy || !llmAvailable} onClick={() => run("llm")} title={llmAvailable ? "" : "Set GROQ_API_KEY or GEMINI_API_KEY"}>
            Run with Groq → Gemini
          </Button>
        </div>
      </div>
      {err && <div className="card bg-ember/20 p-3 text-sm">{err}</div>}
      {!res && !busy && <Empty>Run the suite to see results.</Empty>}
      {res && (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <Stat tone="bg-sun" big={`${passed}/${res.golden.length}`} label="golden cases passed" />
            <Stat tone="bg-ember" big={`${red.filter((g) => g.pass).length}/${red.length}`} label="red-team attacks blocked" />
            <Stat tone="bg-sky" big={`${Math.round(res.shadow.agentCorrect * 100)}% vs ${Math.round(res.shadow.humanCorrect * 100)}%`} label="right call on replayed tickets: agent vs human" />
            <Stat tone="bg-rose" big={`${res.shadow.contactsAvoided}`} label="repeat contacts avoided on replay" />
            <Stat tone="bg-mint" big={`${(res.shadow.medianHumanMinutes / 60).toFixed(0)}h → secs`} label="median human time vs agent" />
          </div>
          <div className="card overflow-hidden">
            <div className="border-b-2 border-ink px-4 py-2">
              <SectionLabel right={<Pill>{res.brain === "llm" ? "Groq → Gemini" : "offline planner"}</Pill>}>Golden cases</SectionLabel>
            </div>
            {res.golden.map((g) => (
              <div key={g.id} className="border-t border-ink/10 first:border-0">
                <button onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-cream">
                  <span className={cx("grid h-6 w-6 place-items-center rounded-full border-2 border-ink text-xs font-bold", g.pass ? "bg-mint" : "bg-ember")}>{g.pass ? "✓" : "✗"}</span>
                  <span className="font-mono text-xs font-bold">{g.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{g.title}</span>
                  <Pill>{g.category}</Pill>
                  <LevelBadge level={g.maxLevel} />
                  <span className="hidden w-32 truncate text-right font-mono text-[11px] text-muted sm:block">{g.status}</span>
                </button>
                {open === g.id && (
                  <div className="bg-cream/60 px-12 py-2 text-[12.5px]">
                    {g.checks.map((c, i) => (
                      <div key={i}>
                        {c.pass ? "✅" : "❌"} {c.name} {c.detail && <span className="text-muted">({c.detail})</span>}
                      </div>
                    ))}
                    <div className="mt-1 font-mono text-[11px] text-muted">actions: {g.toolCalls.join(" → ") || "none"}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <div className="border-b-2 border-ink px-4 py-2">
              <SectionLabel>
                Shadow mode · historical tickets (synthetic stand-ins) · agreement with human {Math.round(res.shadow.agreement * 100)}%
              </SectionLabel>
            </div>
            <table className="w-full text-left text-[12.5px]">
              <thead className="label bg-cream text-muted">
                <tr>
                  {["Ticket", "Human did", "Right call", "Agent proposed", "Human took", "Contacts", "Note"].map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.shadow.rows.map((r) => (
                  <tr key={r.id} className="border-t border-ink/10">
                    <td className="px-3 py-2 font-mono font-bold whitespace-nowrap">
                      {r.correct ? "✅" : "❌"} {r.id}
                    </td>
                    <td className={cx("px-3 py-2 font-mono", !r.humanCorrect && "text-ember")}>{r.humanAction}</td>
                    <td className="px-3 py-2 font-mono">{r.gold}</td>
                    <td className="px-3 py-2 font-mono text-muted">{r.agentProposed.join(", ")}</td>
                    <td className="px-3 py-2">{(r.humanMinutes / 60).toFixed(1)} h</td>
                    <td className="px-3 py-2">{r.humanContacts} → 1</td>
                    <td className="max-w-[280px] px-3 py-2 text-[11.5px] text-muted">{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ big, label, tone }: { big: string; label: string; tone: string }) {
  return (
    <div className={cx("card p-4", tone)}>
      <div className="font-display text-4xl font-extrabold tracking-tight">{big}</div>
      <div className="mt-1 text-[13px] font-semibold">{label}</div>
    </div>
  );
}
