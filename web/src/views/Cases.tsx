import { useEffect, useState } from "react";
import type { Snapshot } from "../lib/api";
import { api, fmtTime } from "../lib/api";
import { Empty, LevelBadge, StatusBadge } from "../components/ui";
import { ScenarioButtons } from "../components/ScenarioButtons";

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
      <div className="border-b border-line p-4">
        <div className="label text-muted">Durable case memory · SQLite</div>
        <div className="font-display text-lg font-semibold">Archive across sessions and restarts</div>
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
                <tr key={c.room + c.id} className="border-t border-line">
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
  return (
    <div className="min-w-0">
      <div className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <div className="label text-muted">Case memory</div>
          <div className="font-display text-xl font-semibold">All cases · one owner each, complaint to confirmed closure</div>
        </div>
        {snap.cases.length === 0 ? (
          <div className="p-4">
            <Empty action={<ScenarioButtons items={[{ id: "A", label: "Run scenario A · Manjunath's ₹480" }, { id: "B", label: "Run scenario B · ₹1.84 L settlement" }]} />}>No cases yet. Start one and watch the agent hear, plan, check, act and verify.</Empty>
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
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => open(c.id)}
                    onKeyDown={(e) => e.key === "Enter" && open(c.id)}
                    className="cursor-pointer border-t border-line hover:bg-sun/15 focus:bg-sun/15 focus:outline-none"
                  >
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
  );
}
