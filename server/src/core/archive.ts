// Durable case memory: closed and open cases plus the audit chain are written to SQLite
// (Node's built-in node:sqlite), so the record survives restarts. The simulated world itself
// is ephemeral by design. If SQLite is unavailable the archive degrades to a no-op.

import fs from "node:fs";
import path from "node:path";
import type { Case } from "./types.js";
import type { AuditEntry } from "./audit.js";

type Db = {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
};

class Archive {
  private db: Db | null = null;
  ready: Promise<void>;
  disabled = process.env.ARCHIVE === "off" || process.env.VITEST === "true";

  constructor() {
    this.ready = this.disabled ? Promise.resolve() : this.open();
  }

  private async open() {
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const file = process.env.DB_PATH ?? path.resolve(process.cwd(), "data/resolveai.db");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const db = new DatabaseSync(file) as unknown as Db;
      db.exec(`
        CREATE TABLE IF NOT EXISTS cases (
          room TEXT NOT NULL, id TEXT NOT NULL, merchant TEXT, workflow TEXT, status TEXT, max_level TEXT,
          opened_at INTEGER, closed_at INTEGER, csat INTEGER, body TEXT, updated_at INTEGER,
          PRIMARY KEY (room, id));
        CREATE TABLE IF NOT EXISTS audit (
          room TEXT NOT NULL, seq INTEGER NOT NULL, ts INTEGER, case_id TEXT, actor TEXT, type TEXT,
          hash TEXT, prev_hash TEXT, body TEXT, PRIMARY KEY (room, seq));
      `);
      this.db = db;
    } catch (e) {
      console.warn(`[archive] SQLite unavailable, running without persistence: ${(e as Error).message}`);
    }
  }

  saveCases(room: string, cases: Case[]) {
    if (!this.db) return;
    const stmt = this.db.prepare(
      `INSERT INTO cases (room,id,merchant,workflow,status,max_level,opened_at,closed_at,csat,body,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(room,id) DO UPDATE SET status=excluded.status, max_level=excluded.max_level, closed_at=excluded.closed_at,
         csat=excluded.csat, body=excluded.body, updated_at=excluded.updated_at`,
    );
    for (const c of cases) {
      stmt.run(room, c.id, c.merchantId, c.workflow, c.status, c.maxLevel, c.openedAt, c.closedAt ?? null, c.csat ?? null, JSON.stringify(c), Date.now());
    }
  }

  saveAudit(room: string, e: AuditEntry) {
    if (!this.db) return;
    this.db
      .prepare(`INSERT OR IGNORE INTO audit (room,seq,ts,case_id,actor,type,hash,prev_hash,body) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(room, e.seq, e.ts, e.caseId, e.actor, e.type, e.hash, e.prevHash, JSON.stringify(e.payload));
  }

  recent(limit = 50) {
    if (!this.db) return { enabled: false, cases: [] as unknown[] };
    const rows = this.db
      .prepare(`SELECT room, id, merchant, workflow, status, max_level, opened_at, closed_at, csat, updated_at FROM cases ORDER BY updated_at DESC LIMIT ?`)
      .all(limit);
    return { enabled: true, cases: rows };
  }
}

export const archive = new Archive();
