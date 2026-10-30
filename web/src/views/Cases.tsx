import { useEffect, useState } from "react";
import type { Snapshot } from "../lib/api";
import { api, fmtTime } from "../lib/api";
import { ApprovalCard } from "../components/CasePanel";
import { Empty, LevelBadge, SectionLabel, StatusBadge } from "../components/ui";

interface ArchiveRow {
  room: string;
  id: string;
  merchant: string;
  workflow: string;
  status: string;
  max_level: string;
  csat: number | null;
  updated_at: number;
}

function Archive() {
  const [data, setData] = useState<{ enabled: boolean; cases: ArchiveRow[] } | null>(null);
  useEffect(() => {
    api<{ enabled: boolean; cases: ArchiveRow[] }>("/archive").then(setData).catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <div className="card mt-4 overflow-hidden">
      <div className="border-b-2 border-ink p-4">
        <div className="label text-muted">Durable case memory · SQLite</div>
        <div className="font-display text-lg font-extrabold">Archive across sessions and restarts</div>
        {!data.enabled && <p className="text-[12.5px] text-muted">Persistence is off on this server (needs Node 22.13+ with node:sqlite).</p>}
      </div>
      {data.enabled && (
        <div className="scroll-thin max-h-72 overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="label bg-cream text-muted">
              <tr>
                {["Session", "Case", "Merchant", "Workflow", "Status", "Level", "CSAT", "Updated"].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.room + c.id} className="border-t border-ink/10">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{c.room}</td>
                  <td className="px-3 py-1.5 font-mono font-bold">{c.id}</td>
                  <td className="px-3 py-1.5">{c.merchant}</td>
                  <td className="px-3 py-1.5">{c.workflow}</td>
                  <td className="px-3 py-1.5">{c.status}</td>
                  <td className="px-3 py-1.5">{c.max_level}</td>
                  <td className="px-3 py-1.5">{c.csat ? "★".repeat(c.csat) : "—"}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted">{new Date(c.updated_at).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Cases({ snap, open }: { snap: Snapshot; open: (id: string) => void }) {
  const pending = snap.approvals.filter((a) => a.status === "PENDING");
  const decided = snap.approvals.filter((a) => a.status !== "PENDING");
  const handoffs = snap.cases.filter((c) => c.caseFile);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
      <div className="card overflow-hidden">
        <div className="border-b-2 border-ink p-4">
          <div className="label text-muted">Case memory</div>
          <div className="font-display text-xl font-extrabold">All cases · one owner each, complaint to confirmed closure</div>
        </div>
        {snap.cases.length === 0 ? (
          <div className="p-4">
            <Empty>No cases yet. Run a scenario from the console.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="label bg-cream text-muted">
                <tr>
                  {["Case", "Merchant", "Workflow", "Opened", "Level", "Status", "Actions", "Root cause"].map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snap.cases.map((c) => (
                  <tr key={c.id} onClick={() => open(c.id)} className="cursor-pointer border-t border-ink/10 hover:bg-sun/15">
                    <td className="px-3 py-2 font-mono font-bold">
                      {c.id}
                      {c.proactive && <span className="ml-1 text-sky">●</span>}
                    </td>
                    <td className="px-3 py-2">{snap.merchants.find((m) => m.id === c.merchantId)?.business}</td>
                    <td className="px-3 py-2 capitalize">{c.workflow.replace("_", " ")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtTime(c.openedAt)}</td>
                    <td className="px-3 py-2">
                      <LevelBadge level={c.maxLevel} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-2">{c.actions.length}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-muted">{c.rootCause ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Archive />
      </div>
      <div className="space-y-3">
        <div>
          <SectionLabel>Approval queue · {pending.length} pending</SectionLabel>
          {pending.length ? pending.map((a) => <ApprovalCard key={a.id} a={a} />) : <Empty>Nothing waiting. L2 actions land here.</Empty>}
        </div>
        {decided.length > 0 && (
          <div className="card p-3">
            <SectionLabel>Decided</SectionLabel>
            {decided.map((a) => (
              <div key={a.id} className="text-[12px]">
                <b>{a.id}</b> {a.tool} · {a.status.toLowerCase()} by {a.decidedBy}
              </div>
            ))}
          </div>
        )}
        <div>
          <SectionLabel>Human queue · ready handoffs</SectionLabel>
          {handoffs.length ? (
            handoffs.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className="card mb-2 block w-full cursor-pointer p-3 text-left">
                <div className="flex justify-between">
                  <b className="font-mono text-xs">{c.id}</b>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-1 text-[13px] font-semibold">{c.caseFile!.reason}</div>
                <div className="text-[12px] text-muted">{c.caseFile!.recommendedAction}</div>
              </button>
            ))
          ) : (
            <Empty>No escalations yet.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}
