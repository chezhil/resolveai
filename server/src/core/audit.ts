// Append-only, hash-chained audit log. Each entry commits to the previous one, so any edit,
// deletion or reorder breaks verification from that point on.

import { createHash } from "node:crypto";

export interface AuditEntry {
  seq: number;
  ts: number;
  caseId: string | null;
  actor: string;
  type: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

function digest(e: Omit<AuditEntry, "hash">) {
  return createHash("sha256")
    .update(JSON.stringify([e.seq, e.ts, e.caseId, e.actor, e.type, e.payload, e.prevHash]))
    .digest("hex");
}

export class AuditLog {
  private entries: AuditEntry[] = [];
  onAppend?: (e: AuditEntry) => void;

  append(caseId: string | null, actor: string, type: string, payload: unknown, ts: number) {
    const prevHash = this.entries.at(-1)?.hash ?? GENESIS;
    const base = { seq: this.entries.length + 1, ts, caseId, actor, type, payload, prevHash };
    const entry: AuditEntry = { ...base, hash: digest(base) };
    this.entries.push(entry);
    this.onAppend?.(entry);
    return entry;
  }

  list(caseId?: string) {
    return caseId ? this.entries.filter((e) => e.caseId === caseId) : [...this.entries];
  }

  verify(): { ok: boolean; checked: number; brokenAt?: number } {
    let prev = GENESIS;
    for (const e of this.entries) {
      const { hash, ...rest } = e;
      if (e.prevHash !== prev || digest(rest) !== hash) return { ok: false, checked: this.entries.length, brokenAt: e.seq };
      prev = hash;
    }
    return { ok: true, checked: this.entries.length };
  }

  /** Demo only: silently rewrite an entry to show that verification catches it. */
  tamper(seq: number) {
    const e = this.entries[seq - 1];
    if (!e) return false;
    e.payload = { ...(e.payload as object), tampered: true };
    return true;
  }
}
