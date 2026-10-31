// Human approvers for L2 actions and the two-person rule (P13).
//
// With APPROVER_OPS_PIN / APPROVER_RISK_PIN set, the approver's identity comes from the PIN,
// verified server-side with a constant-time compare; the `by` field in the request is ignored.
// Without PINs (local dev, evals) the identity is simulated: `by` is taken from the request,
// but must still look like a named human (see isNamedHuman).

import { createHash, timingSafeEqual } from "node:crypto";
import { ClientError } from "./errors.js";

export const APPROVERS = ["ops-lead", "risk-lead"] as const;
export type ApproverName = (typeof APPROVERS)[number];

const PIN_ENV: Record<ApproverName, string> = { "ops-lead": "APPROVER_OPS_PIN", "risk-lead": "APPROVER_RISK_PIN" };

/** Name segments that mean "not a person". Checked per segment, so "x-agent" and "Agent" fail too. */
const NON_HUMAN = new Set(["agent", "system", "policy", "bot", "ai", "auto", "llm", "model", "resolveai", "planner", "brain"]);
const NAME_SHAPE = /^[a-z][a-z0-9._-]{1,39}$/i;

/** True when `by` reads as a named human approver, not the agent or another automated actor. */
export function isNamedHuman(by: unknown): by is string {
  if (typeof by !== "string" || !NAME_SHAPE.test(by)) return false;
  return !by
    .toLowerCase()
    .split(/[._-]+/)
    .some((part) => NON_HUMAN.has(part));
}

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

export class ApproverAuth {
  private readonly pins: ReadonlyMap<ApproverName, Buffer>;

  constructor(pins: Partial<Record<ApproverName, string | undefined>>) {
    const entries = APPROVERS.flatMap((name) => {
      const pin = pins[name]?.trim();
      return pin ? [[name, digest(pin)] as const] : [];
    });
    this.pins = new Map(entries);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env) {
    return new ApproverAuth(Object.fromEntries(APPROVERS.map((n) => [n, env[PIN_ENV[n]]])));
  }

  /** PINs are enforced as soon as any approver PIN is configured (fail closed for the others). */
  get enforced() {
    return this.pins.size > 0;
  }

  /** Approvers that can sign right now. */
  get approvers(): ApproverName[] {
    return this.enforced ? APPROVERS.filter((n) => this.pins.has(n)) : [...APPROVERS];
  }

  /**
   * Who is approving. With PINs: the approver whose PIN matches (every PIN is compared, so timing
   * does not reveal which one matched). Without PINs: the claimed name, if it is a named human.
   */
  resolve(input: { by?: string; pin?: string }): { by: string; simulated: boolean } {
    if (!this.enforced) {
      const by = input.by ?? "ops-lead";
      if (!isNamedHuman(by)) throw new ClientError("Approvals must come from a named human", 403);
      return { by, simulated: true };
    }
    const given = digest(input.pin ?? "");
    let match: ApproverName | null = null;
    for (const [name, pin] of this.pins) {
      if (timingSafeEqual(given, pin) && !match) match = name;
    }
    if (!input.pin || !match) throw new ClientError("Invalid approver PIN", 401);
    return { by: match, simulated: false };
  }
}
