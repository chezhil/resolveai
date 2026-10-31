import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { CaseStatus, Level, Stage } from "../lib/api";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Tone = "ink" | "sun" | "sky" | "rose" | "mint" | "ember" | "white" | "brand";
const TONE: Record<Tone, string> = {
  ink: "bg-ink text-white",
  sun: "bg-sun text-ink",
  sky: "bg-sky text-ink",
  rose: "bg-rose text-ink",
  mint: "bg-mint text-ink",
  ember: "bg-ember text-ink",
  white: "bg-white text-ink",
  brand: "bg-brand text-white",
};

export function Button({ tone = "white", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "chunky rounded-[10px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        TONE[tone],
        className,
      )}
    />
  );
}

export function Pill({ tone = "white", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("label inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

export const LEVEL_TONE: Record<Level, Tone> = { L0: "sun", L1: "sky", L2: "rose", L3: "ember" };
export const LEVEL_NAME: Record<Level, string> = { L0: "Inform", L1: "Act within limits", L2: "Act with approval", L3: "Escalate" };

export function LevelBadge({ level }: { level?: Level }) {
  if (!level) return null;
  return <Pill tone={LEVEL_TONE[level]}>{level}</Pill>;
}

const STATUS: Record<CaseStatus, { tone: Tone; label: string }> = {
  OPEN: { tone: "white", label: "Shadow · human queue" },
  IN_PROGRESS: { tone: "sky", label: "Working" },
  AWAITING_APPROVAL: { tone: "rose", label: "Awaiting approval" },
  WATCHING: { tone: "sun", label: "Watching money" },
  ESCALATED: { tone: "ember", label: "Escalated" },
  RESOLVED: { tone: "mint", label: "Verified & closed" },
  FAILED_SAFE: { tone: "ember", label: "Failed safe" },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const STAGE_TONE: Record<Stage, Tone> = {
  HEAR: "sun",
  PLAN: "sky",
  CHECK: "rose",
  ACT: "mint",
  VERIFY: "ember",
  EVENT: "ink",
  HANDOFF: "brand",
};

export function StageChip({ stage }: { stage: Stage }) {
  return <Pill tone={STAGE_TONE[stage]} className="w-[74px] justify-center">{stage}</Pill>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="label text-muted">{children}</span>
      {right}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line p-5 text-center text-sm text-muted">
      {children}
      {action && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="scroll-thin max-h-64 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-sky">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
