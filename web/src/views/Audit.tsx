import { useEffect, useState } from "react";
import type { AuditEntry } from "../lib/api";
import { api, fmtTime } from "../lib/api";
import { Button, Empty, Pill, SectionLabel, cx } from "../components/ui";

interface Verify {
  ok: boolean;
  checked: number;
  brokenAt?: number;
}

export function Audit({ version }: { version: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = async () => {
    const r = await api<{ entries: AuditEntry[]; verify: Verify }>("/audit");
    setEntries(r.entries);
    setVerify(r.verify);
  };
  useEffect(() => {
    load();
  }, [version]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="label text-muted">Immutable audit log</div>
          <div className="font-display text-xl font-extrabold">Every read, proposal, policy decision, approval and action, hash-chained</div>
          <p className="mt-1 text-[13px] text-muted">Each entry commits to the SHA-256 of the one before it. Edit any entry and verification breaks from that point on.</p>
        </div>
        <div className="flex items-center gap-2">
          {verify && <Pill tone={verify.ok ? "mint" : "ember"}>{verify.ok ? `chain valid · ${verify.checked}` : `broken at #${verify.brokenAt}`}</Pill>}
          <Button size="sm" onClick={load}>
            Verify chain
          </Button>
          <Button
            size="sm"
            tone="ember"
            disabled={entries.length < 2}
            onClick={async () => {
              await api("/audit/tamper", { seq: Math.max(1, Math.floor(entries.length / 2)) });
              load();
            }}
          >
            Tamper demo
          </Button>
        </div>
      </div>
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
