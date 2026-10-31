import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { api, ROOM } from "../lib/api";
import { Button, Pill, SectionLabel, cx } from "../components/ui";

interface Connector {
  id: string;
  name: string;
  group: string;
  status: "connected" | "available" | "planned";
  detail: string;
  setup: string[];
}
interface Integrations {
  connectors: Connector[];
  languages: { id: string; code: string; name: string; native: string }[];
  sarvam: { enabled: boolean; models: Record<string, string> };
}

const STATUS_TONE = { connected: "mint", available: "sky", planned: "white" } as const;
const STATUS_LABEL = { connected: "Ready", available: "Needs setup", planned: "Planned" } as const;

export function CopyBlock({ text, dark }: { text: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked: the text is selectable
    }
  };
  return (
    <div className={cx("flex items-start justify-between gap-2 rounded-[10px] border p-3", dark ? "border-night-line bg-night" : "border-line bg-ink")}>
      <code className="min-w-0 break-all font-mono text-[12px] leading-relaxed text-sky select-all">{text}</code>
      <button onClick={copy} aria-label="Copy command" className="shrink-0 cursor-pointer rounded-md p-1 text-sky/80 hover:text-white">
        {done ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

/** Connectors page: every integration, its real status here, and a working MCP and translation test. */
export function Plugins() {
  const [data, setData] = useState<Integrations>();
  const [err, setErr] = useState<string>();
  const origin = location.origin;

  useEffect(() => {
    api<Integrations>("/integrations").then(setData).catch((e) => setErr(String(e.message)));
  }, []);

  const groups = data ? [...new Set(data.connectors.map((c) => c.group))] : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <div className="card p-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Plugins and connectors</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            Connect your own AI tools over MCP, switch the brain, and turn on Sarvam AI voice and translation. Status shows what is configured on this server, not whether the live service has been tested.
          </p>
        </div>
        {err && <div className="card p-4 text-sm">Could not load connectors: {err}</div>}
        {!data && !err && <div className="card p-4 text-sm text-muted">Loading connectors…</div>}
        {groups.map((g) => (
          <div key={g} className="card p-4">
            <SectionLabel>{g}</SectionLabel>
            <ul className="divide-y divide-line">
              {data!.connectors
                .filter((c) => c.group === g)
                .map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.name}</span>
                      <Pill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-muted">{c.detail}</p>
                    <div className="mt-2 space-y-1.5">
                      {c.setup.map((s) => (
                        <CopyBlock key={s} text={s} />
                      ))}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <aside className="min-w-0 space-y-4">
        <McpTester origin={origin} />
        <Translator enabled={!!data?.sarvam.enabled} languages={data?.languages ?? []} />
      </aside>
    </div>
  );
}

function McpTester({ origin }: { origin: string }) {
  const [out, setOut] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-room": ROOM },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const j = await res.json();
      setOut(j.result?.tools?.map((t: { name: string }) => t.name).join("\n") ?? JSON.stringify(j, null, 2));
    } catch (e) {
      setOut(`Request failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card p-4">
      <SectionLabel>Connect an MCP client</SectionLabel>
      <p className="mb-2 text-sm text-muted">Works with Claude Code, Cursor, Claude Desktop or any client that speaks MCP. Money actions are not exposed; issues go through policy.</p>
      <div className="space-y-1.5">
        <CopyBlock text={`claude mcp add --transport http resolveai ${origin}/mcp`} />
        <CopyBlock text="claude mcp add resolveai -- npx tsx server/src/mcp/stdio.ts" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" tone="ink" onClick={run} disabled={busy}>
          {busy ? "Calling…" : "Test: list tools"}
        </Button>
      </div>
      {out && <pre className="scroll-thin mt-2 max-h-48 overflow-auto rounded-[10px] bg-ink p-3 font-mono text-[11px] leading-relaxed text-sky">{out}</pre>}
    </div>
  );
}

function Translator({ enabled, languages }: { enabled: boolean; languages: { id: string; name: string; native: string }[] }) {
  const [text, setText] = useState("Your money will reach your account by 7:30 am tomorrow.");
  const [to, setTo] = useState("ta");
  const [out, setOut] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ text: string }>("/translate", { text, from: "en", to });
      setOut(r.text);
    } catch (e) {
      setOut(undefined);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card p-4">
      <SectionLabel right={<Pill tone={enabled ? "mint" : "white"}>{enabled ? "Sarvam on" : "Sarvam key needed"}</Pill>}>Translate a reply</SectionLabel>
      <label htmlFor="tr-text" className="text-xs font-semibold text-muted">
        English text
      </label>
      <textarea id="tr-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} className="chunky mt-1 w-full resize-none rounded-[10px] bg-white p-2 text-sm" />
      <label htmlFor="tr-lang" className="mt-2 block text-xs font-semibold text-muted">
        Translate to
      </label>
      <select id="tr-lang" value={to} onChange={(e) => setTo(e.target.value)} className="chunky mt-1 w-full cursor-pointer rounded-[10px] bg-white p-2 text-sm">
        {languages
          .filter((l) => l.id !== "en")
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.native}
            </option>
          ))}
      </select>
      <Button size="sm" tone="ink" className="mt-3" onClick={go} disabled={busy || !text.trim()}>
        {busy ? "Translating…" : "Translate with Sarvam"}
      </Button>
      {out && <p className="mt-3 rounded-[10px] bg-sand p-3 text-sm">{out}</p>}
      {error && <p className="mt-3 rounded-[10px] bg-rose p-3 text-sm">{error}</p>}
    </div>
  );
}
