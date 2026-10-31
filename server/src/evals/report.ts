// Machine-readable eval report (`npm run eval -- --json out.json`) for benchmarks and CI dashboards.

import type { EvalResult } from "./golden.js";
import type { runShadowReplay } from "./shadow.js";

type Shadow = Awaited<ReturnType<typeof runShadowReplay>>;

export interface PassRate {
  total: number;
  passed: number;
  passRate: number;
}

export interface LatencyStats {
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface EvalReport {
  schemaVersion: 1;
  generatedAt: string;
  brain: "planner" | "llm";
  ok: boolean;
  golden: PassRate & {
    byCategory: Record<string, PassRate>;
    latency: LatencyStats;
    cases: {
      id: string;
      title: string;
      category: string;
      pass: boolean;
      status: string | null;
      maxLevel: string | null;
      ms: number;
      toolCalls: string[];
      failedChecks: { name: string; detail?: string }[];
    }[];
  };
  shadow: {
    tickets: number;
    agentCorrectRate: number;
    humanCorrectRate: number;
    agreementRate: number;
    contactsAvoided: number;
    medianHumanMinutes: number;
    medianAgentSeconds: number;
    rows: Shadow["rows"];
  };
}

const round = (x: number, digits = 4) => Number(x.toFixed(digits));
const rate = (passed: number, total: number): PassRate => ({ total, passed, passRate: total ? round(passed / total) : 0 });

/** Nearest-rank percentile of a sorted list. */
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export function latencyStats(ms: number[]): LatencyStats {
  const sorted = [...ms].sort((a, b) => a - b);
  const total = sorted.reduce((s, x) => s + x, 0);
  return {
    totalMs: total,
    meanMs: sorted.length ? round(total / sorted.length, 1) : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.at(-1) ?? 0,
  };
}

export function buildReport(input: { brain: "planner" | "llm"; golden: EvalResult[]; shadow: Shadow; now?: Date }): EvalReport {
  const { golden, shadow } = input;
  const categories = [...new Set(golden.map((r) => r.category))];
  const byCategory = Object.fromEntries(
    categories.map((c) => {
      const inCat = golden.filter((r) => r.category === c);
      return [c, rate(inCat.filter((r) => r.pass).length, inCat.length)];
    }),
  );
  const passed = golden.filter((r) => r.pass).length;
  const agentSeconds = shadow.rows.map((r) => r.agentSeconds).sort((a, b) => a - b);
  return {
    schemaVersion: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    brain: input.brain,
    ok: passed === golden.length,
    golden: {
      ...rate(passed, golden.length),
      byCategory,
      latency: latencyStats(golden.map((r) => r.ms)),
      cases: golden.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        pass: r.pass,
        status: r.status ?? null,
        maxLevel: r.maxLevel ?? null,
        ms: r.ms,
        toolCalls: r.toolCalls,
        failedChecks: r.checks.filter((c) => !c.pass).map(({ name, detail }) => ({ name, ...(detail && { detail }) })),
      })),
    },
    shadow: {
      tickets: shadow.rows.length,
      agentCorrectRate: round(shadow.agentCorrect),
      humanCorrectRate: round(shadow.humanCorrect),
      agreementRate: round(shadow.agreement),
      contactsAvoided: shadow.contactsAvoided,
      medianHumanMinutes: shadow.medianHumanMinutes,
      medianAgentSeconds: percentile(agentSeconds, 50),
      rows: shadow.rows,
    },
  };
}
