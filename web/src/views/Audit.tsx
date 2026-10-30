import { useEffect, useState } from "react";
import type { AuditEntry } from "../lib/api";
import { api, fmtTime } from "../lib/api";
import { Button, Empty, Pill, SectionLabel, cx } from "../components/ui";

interface Verify {
  ok: boolean;
  checked: number;
  brokenAt?: number;
}

interface Anchor {
  n: number;
  seq: number;
  hash: string;
  at: string;
  sinks: string[];
}

interface AuditView {
  entries: AuditEntry[];
  verify: Verify;
  anchors: Anchor[];
  anchorCheck: { anchors: number; ok: boolean; mismatched: number[] };
}

export function Audit({ version }: { version: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [view, setView] = useState<AuditView | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const verify = view?.verify ?? null;

  const apply = (r: AuditView) => {
    setEntries(r.entries);
    setView(r);
  };
  const load = async () => apply(await api<AuditView>("/audit"));
  const post = async (path: string, body: unknown = {}) => apply(await api<AuditView>(path, body));
  useEffect(() => {
    load();
  }, [version]);

  const mid = Math.max(1, Math.floor(entries.length / 2));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="max-w-2xl">
          <div className="label text-muted">Immutable audit log · externally anchored</div>
          <div className="font-display text-xl font-extrabold">Every read, proposal, policy decision, approval and action, hash-chained</div>
          <p className="mt-1 text-[13px] text-muted">
            Each entry commits to the SHA-256 of the one before it, and the chain head is published as a signed anchor every 10 entries and at every case close. A naive edit breaks the chain; a full rewrite that
            re-hashes everything still contradicts the published anchors.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verify && <Pill tone={verify.ok ? "mint" : "ember"}>{verify.ok ? `chain valid · ${verify.checked}` : `chain broken at #${verify.brokenAt}`}</Pill>}
          {view && (
            <Pill tone={view.anchorCheck.ok ? "mint" : "ember"}>
              {view.anchorCheck.ok ? `${view.anchorCheck.anchors} anchors match` : `anchor #${view.anchorCheck.mismatched.join(", #")} contradicted`}
            </Pill>
          )}
          <Button size="sm" onClick={load}>
            Verify
          </Button>
          <Button size="sm" tone="sky" onClick={() => post("/audit/anchor")}>
            Publish anchor
          </Button>
          <Button size="sm" tone="ember" disabled={entries.length < 2} onClick={() => post("/audit/tamper", { seq: mid })}>
            Tamper: edit one entry
          </Button>
          <Button size="sm" tone="ember" disabled={!view?.anchors.length} onClick={() => post("/audit/tamper", { seq: Math.min(mid, view?.anchors[0]?.seq ?? mid), mode: "rewrite" })}>
            Tamper: rewrite chain
          </Button>
        </div>
      </div>
      {view && view.anchors.length > 0 && (
        <div className="card p-3">
          <SectionLabel>Published anchors</SectionLabel>
          <div className="grid gap-1">
            {view.anchors.map((a) => (
              <div key={a.n} className={cx("flex flex-wrap items-center gap-2 text-[12px]", view.anchorCheck.mismatched.includes(a.n) && "text-ember")}>
                <span className="font-mono font-bold">#{a.n}</span>
                <span>head of entry {a.seq}</span>
                <span className="font-mono text-muted">{a.hash.slice(0, 16)}…</span>
                <span className="text-muted">{new Date(a.at).toLocaleTimeString("en-IN")}</span>
                {a.sinks.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {entries.length === 0 ? (
        <Empty>No entries yet.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b-2 border-ink px-4 py-2">
            <SectionLabel>{entries.length} entries</SectionLabel>
          </div>
          <div className="scroll-thin max-h-[70vh] overflow-auto">
            <div className="min-w-[640px]">
            {[...entries].reverse().map((e) => {
              const broken = verify && !verify.ok && verify.brokenAt !== undefined && e.seq >= verify.brokenAt;
              return (
                <div key={e.seq} className={cx("border-t border-ink/10", broken && "bg-ember/15")}>
                  <button onClick={() => setOpen(open === e.seq ? null : e.seq)} className="grid w-full cursor-pointer grid-cols-[56px_120px_120px_minmax(0,1fr)_120px] items-center gap-2 px-4 py-1.5 text-left text-[12.5px] hover:bg-cream">
                    <span className="font-mono font-bold">#{e.seq}</span>
                    <span className="whitespace-nowrap text-muted">{fmtTime(e.ts)}</span>
                    <span className="truncate font-mono">{e.actor}</span>
                    <span className="truncate">
                      <b>{e.type}</b> <span className="text-muted">{e.caseId ?? ""}</span>
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted">{e.hash.slice(0, 14)}…</span>
                  </button>
                  {open === e.seq && (
                    <pre className="scroll-thin mx-4 mb-2 max-h-60 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] text-sky">
                      {JSON.stringify({ payload: e.payload, prevHash: e.prevHash, hash: e.hash }, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
