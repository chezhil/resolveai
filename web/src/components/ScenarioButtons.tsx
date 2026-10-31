import { useState } from "react";
import { api } from "../lib/api";
import { useAppNavigate } from "./AppLink";
import { Button } from "./ui";

/** One-click starters for an empty page: run a demo scenario, then open the console to watch the agent work. */
export function ScenarioButtons({ items, watch = true }: { items: { id: string; label: string }[]; watch?: boolean }) {
  const go = useAppNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string) => {
    setBusy(id);
    try {
      await api(`/scenarios/${id}`, {});
      if (watch) go("/");
    } catch {
      /* the console shows the error state; staying put is the safe choice */
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {items.map((s) => (
        <Button key={s.id} tone="ink" size="sm" disabled={busy !== null} onClick={() => void run(s.id)}>
          {busy === s.id ? "Starting…" : s.label}
        </Button>
      ))}
    </>
  );
}
