import { useEffect, useState } from "react";
import type { Snapshot } from "../lib/api";
import { api } from "../lib/api";
import { usePinRequired } from "../lib/meta";
import { Button, SectionLabel, cx } from "./ui";

interface Step {
  title: string;
  caption: string;
  action: string;
  run: (snap: Snapshot, pinRequired: boolean) => Promise<unknown>;
  /** Label when approver PINs are enforced and a human has to sign on the approval card. */
  pinAction?: string;
  pinCaption?: string;
}

const STEP_KEY = "resolveai-demo-step";
const readStep = () => {
  try {
    return Number(sessionStorage.getItem(STEP_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
};

const approvePending = async (snap: Snapshot, pinRequired: boolean) => {
  const pending = snap.approvals.find((a) => a.status === "PENDING");
  if (!pending) return;
  // With real approver PINs the guide can't sign for anyone: the humans do it on the approval card.
  if (pinRequired) throw new Error("Still waiting: two different approvers must enter their PINs on the approval card in the case file.");
  const approvers = ["ops-lead", "risk-lead"].slice(0, pending.required);
  for (const by of approvers) await api(`/approvals/${pending.id}`, { decision: "APPROVED", by });
};

const STEPS: Step[] = [
  {
    title: "A silent soundbox",
    caption: "A Kannada voice note arrives. The agent checks the ledger, raises a bank ticket (L1), and promises an exact time.",
    action: "Run scenario A",
    run: () => api("/scenarios/A", {}),
  },
  {
    title: "Next morning",
    caption: "The watcher wakes the agent when the bank credits. It re-reads the ledger and only then closes the case.",
    action: "Jump to next morning",
    run: () => api("/clock/advance", { minutes: 24 * 60 }),
  },
  {
    title: "Held settlement",
    caption: "A Rs 1.84 L settlement is held for a name mismatch. The agent runs a penny-drop, then needs a human (L2).",
    action: "Run scenario B",
    run: () => api("/scenarios/B", {}),
  },
  {
    title: "Two-person rule",
    caption: "Above Rs 1 L, two different people must approve. One person cannot approve twice.",
    action: "Approve as ops-lead + risk-lead",
    pinAction: "Both signed, continue",
    pinCaption: "Above Rs 1 L, two different people must approve. Each approver enters their own PIN on the approval card; the server ties the signature to the PIN.",
    run: approvePending,
  },
  {
    title: "Social engineering",
    caption: "A fake-urgent request to change the payout account. Policy P1 blocks it and the fraud desk gets a case file (L3).",
    action: "Run scenario D",
    run: () => api("/scenarios/D", {}),
  },
  {
    title: "Duplicate debit",
    caption: "Two identical credited payments. The agent confirms both in the ledger and refunds only the later one (P14).",
    action: "Run scenario G",
    run: () => api("/scenarios/G", {}),
  },
];

export function DemoGuide({ snap }: { snap: Snapshot }) {
  const pinRequired = usePinRequired();
  const [i, setI] = useState(() => Math.min(readStep(), STEPS.length - 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const step = STEPS[i];
  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_KEY, String(i));
    } catch {
      // per-tab convenience only
    }
  }, [i]);

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await step.run(snap, pinRequired);
      if (i < STEPS.length - 1) setI(i + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Step failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card bg-sun/40 p-3">
      <SectionLabel>
        Guided demo · step {i + 1} of {STEPS.length}
      </SectionLabel>
      <div className="font-display text-base font-extrabold leading-tight">{step.title}</div>
      <p className="mt-1 text-[12.5px] leading-snug">{pinRequired && step.pinCaption ? step.pinCaption : step.caption}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button tone="brand" size="sm" disabled={busy} onClick={go}>
          {pinRequired && step.pinAction ? step.pinAction : step.action}
        </Button>
        <Button size="sm" disabled={i === 0} onClick={() => setI(i - 1)}>
          Back
        </Button>
        {i === STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setI(0)}>
            Restart
          </Button>
        ) : (
          <Button size="sm" onClick={() => setI(i + 1)}>
            Skip
          </Button>
        )}
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {STEPS.map((s, n) => (
          <span key={s.title} className={cx("h-1.5 flex-1 rounded-full border border-ink", n < i ? "bg-mint" : n === i ? "bg-brand" : "bg-white")} />
        ))}
      </div>
      {error && <p className="mt-2 text-[12px] font-semibold text-ember">{error}</p>}
    </div>
  );
}
