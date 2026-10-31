import { describe, expect, it } from "vitest";
import { Runtime } from "../src/core/runtime.js";
import { SCENARIOS } from "../src/sim/scenarios.js";
import { HOUR } from "../src/sim/world.js";

const IST = 5.5 * HOUR;
const DAY = 24 * HOUR;

describe("RBI turnaround clock", () => {
  it("runs to the end of T+1 in IST, then is met once the credit lands in time", async () => {
    const rt = new Runtime({ pacingMs: 0, brain: "planner" });
    SCENARIOS.find((s) => s.id === "A")!.run(rt);
    await rt.idle();
    const txn = [...rt.world.txns.values()].find((t) => t.beneficiaryCredit === "PENDING")!;
    const expected = Math.floor((txn.ts + IST) / DAY) * DAY - IST + 2 * DAY;

    const running = rt.snapshot().cases[0].tat!;
    expect(running.state).toBe("running");
    expect(running.deadlineAt).toBe(expected);
    expect(running.hoursLeft).toBeGreaterThan(0);

    rt.advance(24 * 60);
    await rt.idle();
    expect(rt.snapshot().cases[0].tat!.state).toBe("met");
  });

  it("reports a breach when the credit lands after the deadline", async () => {
    const rt = new Runtime({ pacingMs: 0, brain: "planner" });
    SCENARIOS.find((s) => s.id === "A")!.run(rt);
    await rt.idle();
    // Push the clock past the end of T+1 without letting the credit land in time.
    const txn = [...rt.world.txns.values()].find((t) => t.beneficiaryCredit === "PENDING")!;
    txn.ts -= 3 * DAY;
    expect(rt.snapshot().cases[0].tat!.state).toBe("breached");
  });
});
