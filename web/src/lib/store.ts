// Live state over Server-Sent Events: snapshot + trace + message + soundbox streams.

import { useEffect, useRef, useState } from "react";
import type { Announcement, Snapshot, TraceEvent } from "./api";

export function useLive() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [traces, setTraces] = useState<Record<string, TraceEvent[]>>({});
  const [lastAnnouncement, setLast] = useState<Announcement | null>(null);
  const [connected, setConnected] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("state", (e) => {
      const s: Snapshot = JSON.parse((e as MessageEvent).data);
      setSnap(s);
      if (!s.cases.length) {
        seen.current.clear();
        setTraces({});
      }
    });
    es.addEventListener("trace", (e) => {
      const t: TraceEvent = JSON.parse((e as MessageEvent).data);
      if (seen.current.has(t.id)) return;
      seen.current.add(t.id);
      setTraces((prev) => ({ ...prev, [t.caseId]: [...(prev[t.caseId] ?? []), t] }));
    });
    es.addEventListener("soundbox", (e) => setLast(JSON.parse((e as MessageEvent).data)));
    return () => es.close();
  }, []);

  /** Backfill a case's trace (e.g. after a page reload). */
  const hydrate = async (caseId: string) => {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) return;
    const d = await res.json();
    for (const t of d.trace as TraceEvent[]) seen.current.add(t.id);
    setTraces((prev) => ({ ...prev, [caseId]: d.trace }));
  };

  return { snap, traces, lastAnnouncement, connected, hydrate };
}
