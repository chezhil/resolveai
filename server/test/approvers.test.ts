import { describe, expect, it } from "vitest";
import { ApproverAuth, isNamedHuman } from "../src/core/approvers.js";
import { ClientError } from "../src/core/errors.js";
import { Runtime } from "../src/core/runtime.js";
import { SCENARIOS } from "../src/sim/scenarios.js";

const PINS = { "ops-lead": "481516", "risk-lead": "234200" };

/** Scenario B leaves a ₹1.84 L settlement release waiting for two approvers (P13). */
async function pendingTwoPersonApproval() {
  const rt = new Runtime({ pacingMs: 0 });
  SCENARIOS.find((s) => s.id === "B")!.run(rt);
  await rt.idle();
  const appr = [...rt.approvals.values()][0]!;
  return { rt, appr };
}

function errorOf(fn: () => unknown): ClientError | undefined {
  try {
    fn();
  } catch (e) {
    return e as ClientError;
  }
  return undefined;
}

describe("Approver names", () => {
  it("accepts named humans", () => {
    for (const by of ["ops-lead", "risk-lead", "priya.s", "eval"]) expect(isNamedHuman(by)).toBe(true);
  });
  it("rejects the agent, automated actors and look-alikes", () => {
    for (const by of ["agent", " agent", "x-agent", "Agent", "system", "policy-bot", "resolveai", "", "a", "ops lead", "ops-lead\n"]) {
      expect(isNamedHuman(by)).toBe(false);
    }
  });
});

describe("Approver PIN authentication", () => {
  it("binds the approver to the PIN and ignores the claimed name", () => {
    const auth = new ApproverAuth(PINS);
    expect(auth.enforced).toBe(true);
    expect(auth.resolve({ pin: "481516", by: "risk-lead" })).toEqual({ by: "ops-lead", simulated: false });
    expect(auth.resolve({ pin: "234200" })).toEqual({ by: "risk-lead", simulated: false });
  });

  it("rejects a wrong or missing PIN with 401", () => {
    const auth = new ApproverAuth(PINS);
    for (const pin of ["000000", "48151", "4815160", "", undefined]) {
      const err = errorOf(() => auth.resolve({ pin, by: "ops-lead" }));
      expect(err).toBeInstanceOf(ClientError);
      expect(err?.status).toBe(401);
    }
  });

  it("fails closed for an approver whose PIN is not configured", () => {
    const auth = new ApproverAuth({ "ops-lead": "481516" });
    expect(auth.approvers).toEqual(["ops-lead"]);
    expect(errorOf(() => auth.resolve({ pin: "", by: "risk-lead" }))?.status).toBe(401);
  });

  it("falls back to simulated identity when no PINs are set, still requiring a named human", () => {
    const auth = ApproverAuth.fromEnv({});
    expect(auth.enforced).toBe(false);
    expect(auth.resolve({ by: "risk-lead" })).toEqual({ by: "risk-lead", simulated: true });
    expect(auth.resolve({})).toEqual({ by: "ops-lead", simulated: true });
    expect(errorOf(() => auth.resolve({ by: "x-agent" }))?.status).toBe(403);
  });

  it("reads PINs from APPROVER_OPS_PIN / APPROVER_RISK_PIN", () => {
    const auth = ApproverAuth.fromEnv({ APPROVER_OPS_PIN: "111111", APPROVER_RISK_PIN: " " });
    expect(auth.approvers).toEqual(["ops-lead"]);
  });
});

describe("Two-person rule with PINs (P13)", () => {
  it("a wrong PIN signs nothing and the money stays on hold", async () => {
    const { rt, appr } = await pendingTwoPersonApproval();
    const auth = new ApproverAuth(PINS);
    expect(() => rt.decideApproval(appr.id, "APPROVED", auth.resolve({ pin: "999999" }).by)).toThrow(/Invalid approver PIN/);
    expect(appr.approvals).toHaveLength(0);
    expect(rt.world.settlements.get("STL-88213")!.status).toBe("ON_HOLD");
  });

  it("one person can't approve twice, even claiming another name", async () => {
    const { rt, appr } = await pendingTwoPersonApproval();
    const auth = new ApproverAuth(PINS);
    rt.decideApproval(appr.id, "APPROVED", auth.resolve({ pin: PINS["ops-lead"] }).by);
    const second = auth.resolve({ pin: PINS["ops-lead"], by: "risk-lead" });
    const err = errorOf(() => rt.decideApproval(appr.id, "APPROVED", second.by));
    expect(err?.message).toMatch(/Two-person rule/);
    expect(err?.status).toBe(409);
    expect(appr.status).toBe("PENDING");
    expect(appr.approvals.map((x) => x.by)).toEqual(["ops-lead"]);
  });

  it("two different PINs complete the approval", async () => {
    const { rt, appr } = await pendingTwoPersonApproval();
    const auth = new ApproverAuth(PINS);
    rt.decideApproval(appr.id, "APPROVED", auth.resolve({ pin: PINS["ops-lead"] }).by);
    rt.decideApproval(appr.id, "APPROVED", auth.resolve({ pin: PINS["risk-lead"] }).by);
    await rt.idle();
    expect(appr.status).toBe("APPROVED");
    expect(appr.approvals.map((x) => x.by)).toEqual(["ops-lead", "risk-lead"]);
  });
});
