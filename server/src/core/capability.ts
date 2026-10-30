// Signed action capabilities. When the policy engine allows a money or messaging action, it
// mints a short-lived, single-use token that binds the exact tool, input, case and approvers
// with HMAC-SHA256. The tools refuse to run without a valid token, so a compromised model, a
// forged tool call or a replayed request cannot move money around the policy engine.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const KEY = process.env.ACTION_SIGNING_KEY ? Buffer.from(process.env.ACTION_SIGNING_KEY, "utf-8") : randomBytes(32);
const TTL_MS = 60_000;

export interface CapabilityClaims {
  v: 1;
  caseId: string;
  tool: string;
  inputHash: string;
  level: string;
  rules: string[];
  approvers: string[];
  nonce: string;
  exp: number;
}

/** Stable JSON: sorted keys, so the same input always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const hashInput = (input: unknown) => createHash("sha256").update(canonical(input)).digest("hex");
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", KEY).update(body).digest("base64url");

export class CapabilityIssuer {
  private used = new Set<string>();
  issued = 0;
  rejected = 0;

  issue(i: { caseId: string; tool: string; input: unknown; level: string; rules: string[]; approvers?: string[] }) {
    const claims: CapabilityClaims = {
      v: 1,
      caseId: i.caseId,
      tool: i.tool,
      inputHash: hashInput(i.input),
      level: i.level,
      rules: i.rules,
      approvers: i.approvers ?? [],
      nonce: randomBytes(9).toString("base64url"),
      exp: Date.now() + TTL_MS,
    };
    const body = b64(JSON.stringify(claims));
    this.issued++;
    return `${body}.${sign(body)}`;
  }

  /** Throws unless the token is authentic, unexpired, unused and bound to exactly this call. */
  verify(token: string | undefined, expect: { caseId: string; tool: string; input: unknown }): CapabilityClaims {
    const fail = (why: string): never => {
      this.rejected++;
      throw new Error(`Money rail rejected the call: ${why}`);
    };
    if (!token) return fail("no signed capability from the policy engine");
    const [body, sig] = token.split(".");
    if (!body || !sig) return fail("malformed capability");
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fail("bad signature");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as CapabilityClaims;
    if (claims.exp < Date.now()) return fail("capability expired");
    if (this.used.has(claims.nonce)) return fail("capability already used (replay)");
    if (claims.caseId !== expect.caseId) return fail("capability issued for a different case");
    if (claims.tool !== expect.tool) return fail(`capability is for ${claims.tool}, not ${expect.tool}`);
    if (claims.inputHash !== hashInput(expect.input)) return fail("arguments differ from what policy approved");
    this.used.add(claims.nonce);
    return claims;
  }
}
