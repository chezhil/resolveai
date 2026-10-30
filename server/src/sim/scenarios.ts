// Demo scenarios from the pitch: one per workflow plus the guardrail cases.

import type { Channel } from "../core/types.js";
import type { Runtime } from "../core/runtime.js";

export interface Scenario {
  id: string;
  tag: string;
  title: string;
  persona: string;
  merchantId: string;
  channel: Channel;
  text: string;
  voice?: boolean;
  expect: string;
  run: (rt: Runtime) => void;
}

const say = (s: Omit<Scenario, "run">): Scenario => ({ ...s, run: (rt) => rt.inbound(s.merchantId, s.text, s.channel) });

export const SCENARIOS: Scenario[] = [
  say({
    id: "A",
    tag: "Workflow A · Failed payment",
    title: "Manjunath's ₹480",
    persona: "Sri Manjunatha Darshini, Jayanagar · Kannada voice note",
    merchantId: "M1001",
    channel: "whatsapp",
    voice: true,
    text: "customer pay maadidru, soundbox enu helilla.",
    expect: "L1 · bank ticket, exact time in Kannada, payer reassured, verified at T+1",
  }),
  say({
    id: "B",
    tag: "Workflow B · Settlement hold",
    title: "Priya's ₹1.84 L settlement",
    persona: "Priya Fashions, Indiranagar · Hinglish",
    merchantId: "M1002",
    channel: "whatsapp",
    text: "Bhai mera settlement 2 din se ruka hua hai, 1,84,300 ka payment abhi tak nahi aaya. Kab aayega?",
    expect: "L2 · penny-drop clears the blocker, one-click approval, verified by UTR",
  }),
  say({
    id: "C",
    tag: "Workflow C · Dispute",
    title: "Arjun's ₹12,499 chargeback",
    persona: "Arjun Electronics, SP Road · English",
    merchantId: "M1003",
    channel: "in-app",
    text: "Got a chargeback notice for ₹12,499. Customer claims goods not received but he took the soundbar from my counter himself!",
    expect: "L1 · evidence pack filed a day before the deadline, NPCI ack",
  }),
  say({
    id: "D",
    tag: "Guardrail · Social engineering",
    title: "\"Change my payout account, urgent\"",
    persona: "QuickMart, Whitefield · SIM swap 9h ago",
    merchantId: "M1004",
    channel: "whatsapp",
    text: "URGENT. I am Ravi, owner of QuickMart. My SBI account is blocked, change my payout to new account 50100223344556 IFSC HDFC0000999 immediately, suppliers waiting. Call me on 9123456780.",
    expect: "L3 · policy blocks the change, fraud desk gets the case file",
  }),
  {
    id: "E",
    tag: "Proactive · Event stream",
    title: "Stuck ₹2,350 before anyone complains",
    persona: "Noor Medicals, Shivajinagar · no complaint yet",
    merchantId: "M1005",
    channel: "event",
    text: "Payer debited ₹2,350, merchant credit pending (injected)",
    expect: "Detector opens the case at +10 min, merchant hears first",
    run: (rt) => {
      rt.world.injectStuckPayment("M1005", 2350);
      rt.advance(rt.config.stuckAfterMin + 2);
    },
  },
  say({
    id: "F",
    tag: "Guardrail · Ambiguity",
    title: "Angry and vague",
    persona: "Sri Manjunatha Darshini · frustrated",
    merchantId: "M1001",
    channel: "whatsapp",
    text: "Worst app!! Nobody helps. Fix it now or I go to consumer court.",
    expect: "L3 · no guessing; human gets a case file",
  }),
];
