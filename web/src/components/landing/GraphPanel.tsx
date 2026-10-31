import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The dark graph panel: sources -> facts -> conclusions -> actions for one duplicate-debit case.
 * "loop" replays the story on its own (healthy, late bank message, contained, restored);
 * "play" lets the visitor poison a node and watch everything built on it get contained;
 * "focus" lights one column for the scroll story.
 * It is an illustration of scenario H in the console, not live data.
 */

type Col = 0 | 1 | 2 | 3;
interface N {
  id: string;
  col: Col;
  row: number;
  title: string;
  sub: string;
}

const NODES: N[] = [
  { id: "ledger", col: 0, row: 0, title: "Paytm ledger", sub: "system" },
  { id: "bank", col: 0, row: 1, title: "Bank feed", sub: "webhook" },
  { id: "p1", col: 1, row: 0, title: "Payment 1 credited", sub: "₹4,500" },
  { id: "p2", col: 1, row: 1, title: "Payment 2 credited", sub: "₹4,500" },
  { id: "dup", col: 2, row: 0, title: "Duplicate debit", sub: "rule P14" },
  { id: "tier", col: 2, row: 1, title: "Above the L1 cap", sub: "needs a human" },
  { id: "refund", col: 3, row: 0, title: "Refund ₹4,500", sub: "waiting for approval" },
  { id: "msg", col: 3, row: 1, title: "Tell the merchant", sub: "message" },
];

const EDGES: [string, string][] = [
  ["ledger", "p1"],
  ["ledger", "p2"],
  ["bank", "p2"],
  ["p1", "dup"],
  ["p2", "dup"],
  ["dup", "tier"],
  ["tier", "refund"],
  ["dup", "msg"],
];

const COLS = ["SOURCES", "FACTS", "CONCLUSIONS", "ACTIONS"];

/** Everything built on `id`, including itself. */
function downstream(id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of EDGES) if (out.has(a) && !out.has(b)) (out.add(b), (grew = true));
  }
  return out;
}

const W = 760;
const H = 268;
const CW = 132;
const CH = 52;

function pos(n: N, tall: boolean) {
  if (!tall) {
    const xs = [24, 218, 412, 604];
    return { x: xs[n.col], y: 86 + n.row * 96 };
  }
  // phone: columns become rows, two nodes per row
  return { x: 14 + n.row * 168, y: 40 + n.col * 96 };
}

export function GraphPanel({ mode, focus = -1, className = "" }: { mode: "loop" | "play" | "focus"; focus?: number; className?: string }) {
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [tall, setTall] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setTall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Loop mode: healthy, then the late bank message travels bank -> p2 -> dup -> tier -> refund and msg, hold, restore.
  useEffect(() => {
    if (mode !== "loop") return;
    const order = ["bank", "p2", "dup", "tier", "refund", "msg"];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHot(new Set(order));
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const run = () => {
      if (cancelled) return;
      setHot(new Set());
      order.forEach((id, i) => timers.push(window.setTimeout(() => !cancelled && setHot((h) => new Set(h).add(id)), 2600 + i * 420)));
      timers.push(window.setTimeout(run, 2600 + order.length * 420 + 3600));
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [mode]);

  const pickNode = (id: string) => {
    if (mode !== "play") return;
    setPicked(id);
    setHot(downstream(id));
  };
  const restore = () => {
    setPicked(null);
    setHot(new Set());
  };

  const nodes = useMemo(() => NODES.map((n) => ({ ...n, ...pos(n, tall) })), [tall]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const vw = tall ? 350 : W;
  const vh = tall ? 4 * 96 + 40 : H;

  const hotActions = ["refund", "msg"].filter((a) => hot.has(a)).length;
  const hotFacts = ["p1", "p2"].filter((a) => hot.has(a)).length;
  const status = hot.size === 0 ? "All beliefs healthy" : mode === "loop" ? "A late bank message is contained" : `${hot.size} contained`;

  return (
    <div className={`overflow-hidden rounded-[18px] bg-night text-fog shadow-[0_30px_60px_-30px_rgba(11,18,24,0.6)] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
            <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
            <i className="h-2.5 w-2.5 rounded-full bg-night-line" />
          </span>
          <span className="truncate font-mono text-[11.5px] text-fog-muted">resolveai / arjun-electronics / case-0001</span>
        </div>
        <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-night-line px-3 py-1 font-mono text-[11px]" role="status">
          <i className={`h-2 w-2 rounded-full ${hot.size ? "bg-redfill" : "bg-mintfill"}`} aria-hidden />
          {status}
        </span>
      </div>

      <div className="dotgrid px-2 pb-1 pt-3">
        <svg viewBox={`0 0 ${vw} ${vh}`} className="block h-auto w-full" role="img" aria-label="Graph of sources, facts, conclusions and actions for one duplicate-debit case">
          {!tall &&
            COLS.map((c, i) => (
              <text key={c} x={[24, 218, 412, 604][i]} y={30} fontSize="10" letterSpacing="1.6" fill="#93a3a8" fontFamily="JetBrains Mono, monospace">
                {c}
              </text>
            ))}
          {tall &&
            COLS.map((c, i) => (
              <text key={c} x={14} y={30 + i * 96} fontSize="10" letterSpacing="1.6" fill="#93a3a8" fontFamily="JetBrains Mono, monospace">
                {c}
              </text>
            ))}
          {EDGES.map(([a, b]) => {
            const A = byId[a];
            const B = byId[b];
            const x1 = tall ? A.x + CW / 2 : A.x + CW;
            const y1 = tall ? A.y + CH : A.y + CH / 2;
            const x2 = tall ? B.x + CW / 2 : B.x;
            const y2 = tall ? B.y : B.y + CH / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const d = tall ? `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
            const isHot = hot.has(a) && hot.has(b);
            return <path key={a + b} d={d} className={`glink ${isHot ? "hot" : ""}`} />;
          })}
          {nodes.map((n) => {
            const isHot = hot.has(n.id);
            const inFocus = focus >= 0 && n.col === focus;
            const dim = focus >= 0 && !inFocus;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className={`gnode ${isHot ? "hot" : ""} ${inFocus ? "focus" : ""} ${dim ? "dim" : ""} ${mode === "play" ? "cursor-pointer" : ""}`}
                onClick={() => pickNode(n.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pickNode(n.id)}
                tabIndex={mode === "play" ? 0 : undefined}
                role={mode === "play" ? "button" : undefined}
                aria-label={mode === "play" ? `Poison ${n.title}` : undefined}
              >
                <rect width={CW} height={CH} rx={9} />
                <text x={10} y={22} fontSize="12">
                  {n.title.length > 19 ? n.title.slice(0, 18) + "…" : n.title}
                </text>
                <text x={10} y={39} fontSize="10" className="sub">
                  {isHot && n.col === 3 ? "held, not executed" : isHot && n.col === 2 ? "no longer valid" : n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {mode === "play" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-night-line px-4 py-3">
          <div className="flex flex-wrap gap-4 font-mono text-[12px]">
            <span>
              <b className="text-[18px] text-fog">{hotFacts}</b> facts contained
            </span>
            <span>
              <b className="text-[18px] text-fog">{hotActions}</b> actions held
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => pickNode("bank")} className="cursor-pointer rounded-full border border-redfill px-4 py-1.5 text-[13px] font-bold text-[#ffd9d2] hover:bg-redfill/15">
              Late bank reversal
            </button>
            <button onClick={restore} disabled={!picked} className="cursor-pointer rounded-full border border-night-line px-4 py-1.5 text-[13px] font-bold disabled:cursor-default disabled:opacity-40">
              Restore everything
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-night-line px-4 py-3 font-mono text-[11.5px] text-fog-muted">
          <span>
            <b className="text-fog">{hotFacts}</b> facts contained
          </span>
          <span>
            <b className="text-fog">{hotActions}</b> actions held
          </span>
          <span className="ml-auto">No human can sign what rests on a changed fact.</span>
        </div>
      )}
    </div>
  );
}
