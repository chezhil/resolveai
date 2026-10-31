/** Honest answers to the questions a judge, a merchant's support lead or an engineer asks first. */
const QA: { q: string; a: string }[] = [
  {
    q: "Does it move money on its own?",
    a: "Only inside limits a deterministic policy sets. Low-value, reversible actions (a push-credit bank ticket, refunds up to ₹2,000, dispute evidence) run on their own. Higher-value ones wait in an approval queue, and above ₹1 lakh two different people must sign. The model never has the last word: policy does.",
  },
  {
    q: "How is this different from a chatbot?",
    a: "A chatbot explains the policy and hands off. ResolveAI checks the ledger, Paytm PG, the bank and UDIR, takes the fix, sets a watcher, and closes the case only after re-reading the systems and finding the money moved. If it cannot finish, a human gets a complete case file instead of a transcript.",
  },
  {
    q: "What if the AI model is down or wrong?",
    a: "The deterministic planner takes over through the same tools, policy engine and verifier, and the console shows a Degraded mode banner. If a model fails after a money action has already run, the case fails safe to a human instead of replaying the action. A wrong model proposal is stopped at the policy step, not trusted.",
  },
  {
    q: "What is real, and what is simulated?",
    a: "The policy engine, signed one-time capabilities, verifier, audit chain and approver PINs are real, tested code. Every Paytm system (ledger, bank, settlements, disputes) is simulated, the shadow tickets are synthetic, and Sarvam and WhatsApp paths need live keys. The Honest section below lists it in full.",
  },
  {
    q: "Where do the numbers on this page come from?",
    a: "They are computed live by the running server: the golden suite (including red-team attacks) and a replay of 14 historical tickets. Open the Analytics page to see every chart, and the Method and limits note for what they do and do not prove.",
  },
  {
    q: "Can I try it, and can I connect my own tools?",
    a: "Yes. Open the live demo (no login; every visitor gets an isolated sandbox), run the demo scenarios, or share a room with ?room=name so a team can watch one session. The Plugins page connects your own tools over MCP.",
  },
];

export function Faq() {
  return (
    <div className="mt-12 grid gap-3 lg:grid-cols-2">
      {QA.map((x, i) => (
        <details key={x.q} className="faq reveal group rounded-[16px] border border-ink/15 bg-white open:border-ink open:shadow-[5px_5px_0_#0b1218]" style={{ ["--d" as string]: `${(i % 2) * 80}ms` }}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[16.5px] font-bold leading-snug">
            {x.q}
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink transition-transform duration-300 group-open:rotate-45">
              <svg viewBox="0 0 12 12" width="11" height="11">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          </summary>
          <p className="faq-body px-5 pb-5 text-[15px] leading-relaxed text-text-2">{x.a}</p>
        </details>
      ))}
    </div>
  );
}
