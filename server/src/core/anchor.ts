// Audit anchoring: the head of the hash chain is periodically published outside the runtime.
// Even someone who can rewrite the whole in-memory or database chain consistently cannot change
// history without contradicting an anchor that was already published.
// Sinks: an append-only local file (always, unless disabled) and, optionally, a GitHub Gist
// (GITHUB_TOKEN + ANCHOR_GIST_ID), which gives a public, timestamped revision history.

import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import type { AuditLog } from "./audit.js";

export interface Anchor {
  n: number;
  label: string;
  seq: number;
  hash: string;
  at: string;
  sig: string;
  sinks: string[];
}

const KEY = process.env.ANCHOR_SIGNING_KEY ? Buffer.from(process.env.ANCHOR_SIGNING_KEY) : randomBytes(32);
const EVERY = Number(process.env.ANCHOR_EVERY ?? 10);
const disabled = process.env.ARCHIVE === "off" || process.env.VITEST === "true";

let gistQueue: Promise<unknown> = Promise.resolve();

function toGist(line: string) {
  const token = process.env.GITHUB_TOKEN;
  const id = process.env.ANCHOR_GIST_ID;
  if (!token || !id) return false;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  // Serialise writes so concurrent anchors don't overwrite each other.
  gistQueue = gistQueue
    .then(async () => {
      const g = await (await fetch(`https://api.github.com/gists/${id}`, { headers })).json();
      const prev = g.files?.["resolveai-anchors.jsonl"]?.content ?? "";
      await fetch(`https://api.github.com/gists/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ files: { "resolveai-anchors.jsonl": { content: prev + line + "\n" } } }),
      });
    })
    .catch((e) => console.warn(`[anchor] gist sink failed: ${(e as Error).message}`));
  return true;
}

export class AnchorLog {
  anchors: Anchor[] = [];

  constructor(private label: string) {}

  /** Anchor every EVERY entries. Call after each append. */
  maybe(audit: AuditLog) {
    const len = audit.length;
    if (len > 0 && len % EVERY === 0) this.anchorNow(audit);
  }

  anchorNow(audit: AuditLog) {
    const head = audit.head();
    if (!head || this.anchors.at(-1)?.seq === head.seq) return this.anchors.at(-1) ?? null;
    const body = { n: this.anchors.length + 1, label: this.label, seq: head.seq, hash: head.hash, at: new Date().toISOString() };
    const sig = createHmac("sha256", KEY).update(JSON.stringify(body)).digest("hex");
    const sinks = ["memory"];
    const line = JSON.stringify({ ...body, sig });
    if (!disabled) {
      try {
        const file = path.resolve(path.dirname(process.env.DB_PATH ?? path.resolve(process.cwd(), "data/resolveai.db")), "anchors.jsonl");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, line + "\n");
        sinks.push("file");
      } catch {
        // file sink unavailable; memory + gist still apply
      }
      if (toGist(line)) sinks.push("gist");
    }
    const a: Anchor = { ...body, sig, sinks };
    this.anchors.push(a);
    return a;
  }

  /** Every published anchor must still match the chain at its sequence number. */
  check(audit: AuditLog) {
    const entries = audit.list();
    const mismatched = this.anchors.filter((a) => entries[a.seq - 1]?.hash !== a.hash).map((a) => a.n);
    return { anchors: this.anchors.length, ok: mismatched.length === 0, mismatched };
  }
}
