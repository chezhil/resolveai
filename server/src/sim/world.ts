// A deterministic, in-memory simulation of the Paytm systems a stuck rupee can hide in:
// ledger, beneficiary bank / PSP, NPCI UDIR, settlement, KYC / risk, disputes and soundbox devices.
// Every World is isolated, so evals and replays never touch the live demo state.

import { EventEmitter } from "node:events";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** 31 Oct 2026, 08:12 IST — breakfast rush at a Bengaluru darshini. */
export const SIM_EPOCH = Date.parse("2026-10-31T08:12:00+05:30");

export interface Merchant {
  id: string;
  owner: string;
  business: string;
  area: string;
  phone: string;
  vpa: string;
  lang: "kn" | "hi" | "en";
  soundboxId: string;
  payoutAccount: { bank: string; accountNo: string; ifsc: string; holderName: string };
  kyc: { status: "VERIFIED" | "RE_VERIFICATION_REQUIRED"; panName: string; pan: string; issues: string[] };
  risk: { flags: { code: string; severity: "low" | "medium" | "high"; note: string; at: number }[] };
}

export interface Txn {
  txnId: string;
  rrn: string;
  merchantId: string;
  payerVpa: string;
  payerName: string;
  amount: number;
  ts: number;
  payerDebit: "SUCCESS" | "FAILED";
  beneficiaryCredit: "SUCCESS" | "PENDING" | "REVERSED";
  creditedAt?: number;
  soundboxAnnounced: boolean;
  bankStatus: "CREDITED" | "CREDIT_PENDING_AT_BENEFICIARY" | "REVERSED_TO_PAYER";
}

export interface Settlement {
  batchId: string;
  merchantId: string;
  amount: number;
  txnCount: number;
  status: "ON_HOLD" | "PROCESSING" | "SETTLED";
  holdReason?: "BANK_NAME_MISMATCH" | "RISK_REVIEW";
  heldSince?: number;
  settledAt?: number;
  utr?: string;
}

export interface Dispute {
  disputeId: string;
  merchantId: string;
  txnId: string;
  amount: number;
  reason: string;
  raisedAt: number;
  deadline: number;
  status: "OPEN" | "REPRESENTED" | "WON" | "LOST";
  evidenceFiled: string[];
  ackRef?: string;
}

export interface Evidence {
  id: string;
  disputeId: string;
  kind: "QR_SCAN_LOG" | "SOUNDBOX_ANNOUNCEMENT" | "PAYER_AUTH" | "INVOICE" | "DEVICE_GEO";
  summary: string;
  ts: number;
}

export interface BankTicket {
  ticketId: string;
  rrn: string;
  kind: "PUSH_CREDIT" | "REVERSAL";
  udirRef: string;
  createdAt: number;
  eta: number;
  status: "OPEN" | "RESOLVED";
}

export interface Announcement {
  soundboxId: string;
  merchantId: string;
  text: string;
  amount: number;
  ts: number;
}

interface Scheduled {
  at: number;
  label: string;
  run: () => void;
}

export type WorldEvent =
  | { type: "txn.credit_pending"; txn: Txn }
  | { type: "txn.credited"; txn: Txn }
  | { type: "settlement.settled"; settlement: Settlement }
  | { type: "soundbox.announce"; announcement: Announcement }
  | { type: "clock"; now: number };

export class World extends EventEmitter {
  private clock = SIM_EPOCH;
  private seq = 1;
  private queue: Scheduled[] = [];

  merchants = new Map<string, Merchant>();
  txns = new Map<string, Txn>();
  settlements = new Map<string, Settlement>();
  disputes = new Map<string, Dispute>();
  evidence = new Map<string, Evidence>();
  tickets = new Map<string, BankTicket>();
  announcements: Announcement[] = [];
  payoutChangeRequests: { merchantId: string; requested: unknown; at: number; blocked: boolean }[] = [];

  constructor() {
    super();
    this.seed();
  }

  now() {
    return this.clock;
  }

  /** Move the simulated clock forward, running anything that falls due on the way. */
  advance(ms: number) {
    const target = this.clock + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.clock = Math.max(this.clock, next.at);
      next.run();
    }
    this.clock = target;
    this.emit("world", { type: "clock", now: this.clock } satisfies WorldEvent);
  }

  schedule(at: number, label: string, run: () => void) {
    this.queue.push({ at, label, run });
  }

  pending() {
    return this.queue.map((q) => ({ at: q.at, label: q.label })).sort((a, b) => a.at - b.at);
  }

  private id(prefix: string) {
    return `${prefix}-${String(this.seq++).padStart(4, "0")}`;
  }

  // ---------- reads ----------

  searchTxns(merchantId: string, opts: { amount?: number; sinceMinutes?: number } = {}) {
    const since = this.clock - (opts.sinceMinutes ?? 7 * 24 * 60) * MIN;
    return [...this.txns.values()]
      .filter((t) => t.merchantId === merchantId && t.ts >= since)
      .filter((t) => (opts.amount ? Math.abs(t.amount - opts.amount) < 0.5 : true))
      .sort((a, b) => b.ts - a.ts);
  }

  txnByRrn(rrn: string) {
    return [...this.txns.values()].find((t) => t.rrn === rrn);
  }

  // ---------- actions ----------

  raiseBankTicket(rrn: string, kind: BankTicket["kind"]) {
    const txn = this.txnByRrn(rrn);
    if (!txn) throw new Error(`No transaction with RRN ${rrn}`);
    const existing = [...this.tickets.values()].find((t) => t.rrn === rrn && t.status === "OPEN");
    if (existing) return existing;
    // Beneficiary banks clear PUSH_CREDIT requests in their next morning reconciliation cycle.
    const eta = nextAt(this.clock, 7, 30);
    const ticket: BankTicket = {
      ticketId: this.id("BKT"),
      rrn,
      kind,
      udirRef: `UDIR${String(rrn).slice(-6)}${this.seq}`,
      createdAt: this.clock,
      eta,
      status: "OPEN",
    };
    this.tickets.set(ticket.ticketId, ticket);
    this.schedule(eta - 20 * MIN, `Bank pushes credit for RRN ${rrn}`, () => {
      ticket.status = "RESOLVED";
      if (kind === "PUSH_CREDIT") this.creditTxn(txn);
      else {
        txn.beneficiaryCredit = "REVERSED";
        txn.bankStatus = "REVERSED_TO_PAYER";
      }
    });
    return ticket;
  }

  creditTxn(txn: Txn) {
    if (txn.beneficiaryCredit === "SUCCESS") return;
    txn.beneficiaryCredit = "SUCCESS";
    txn.bankStatus = "CREDITED";
    txn.creditedAt = this.clock;
    this.emit("world", { type: "txn.credited", txn } satisfies WorldEvent);
  }

  announce(merchantId: string, amount: number, text: string) {
    const m = this.merchants.get(merchantId)!;
    const a: Announcement = { soundboxId: m.soundboxId, merchantId, amount, text, ts: this.clock };
    this.announcements.push(a);
    this.emit("world", { type: "soundbox.announce", announcement: a } satisfies WorldEvent);
    return a;
  }

  releaseSettlement(batchId: string) {
    const s = this.settlements.get(batchId);
    if (!s) throw new Error(`No settlement batch ${batchId}`);
    if (s.status !== "ON_HOLD") return s;
    s.status = "PROCESSING";
    s.holdReason = undefined;
    // Next IMPS settlement window.
    const at = this.clock + 2 * HOUR;
    this.schedule(at, `Settlement ${batchId} paid out`, () => {
      s.status = "SETTLED";
      s.settledAt = this.clock;
      s.utr = `UTR${batchId.replace(/\D/g, "")}${String(this.seq++).padStart(3, "0")}`;
      this.emit("world", { type: "settlement.settled", settlement: s } satisfies WorldEvent);
    });
    return { ...s, expectedPayoutAt: at };
  }

  fileEvidence(disputeId: string, evidenceIds: string[]) {
    const d = this.disputes.get(disputeId);
    if (!d) throw new Error(`No dispute ${disputeId}`);
    if (this.clock > d.deadline) throw new Error("Representation window closed");
    const valid = evidenceIds.filter((e) => this.evidence.get(e)?.disputeId === disputeId);
    if (valid.length === 0) throw new Error("No valid evidence ids for this dispute");
    d.evidenceFiled = [...new Set([...d.evidenceFiled, ...valid])];
    d.status = "REPRESENTED";
    d.ackRef = d.ackRef ?? `NPCI-ACK-${disputeId.slice(-5)}`;
    return d;
  }

  /** Inject a fresh stuck payment for the proactive-detection demo. */
  injectStuckPayment(merchantId: string, amount: number, payer = { vpa: "anita.r@ybl", name: "Anita R" }) {
    const txn: Txn = {
      txnId: this.id("TXN"),
      rrn: String(630400000000 + this.seq * 7919),
      merchantId,
      payerVpa: payer.vpa,
      payerName: payer.name,
      amount,
      ts: this.clock,
      payerDebit: "SUCCESS",
      beneficiaryCredit: "PENDING",
      soundboxAnnounced: false,
      bankStatus: "CREDIT_PENDING_AT_BENEFICIARY",
    };
    this.txns.set(txn.txnId, txn);
    this.emit("world", { type: "txn.credit_pending", txn } satisfies WorldEvent);
    return txn;
  }

  // ---------- seed data ----------

  private seed() {
    const t = this.clock;
    const add = <K, V>(m: Map<K, V>, k: K, v: V) => m.set(k, v);

    add(this.merchants, "M1001", {
      id: "M1001",
      owner: "Manjunath K",
      business: "Sri Manjunatha Darshini",
      area: "Jayanagar 4th Block, Bengaluru",
      phone: "+91 98450 12345",
      vpa: "manjunatha.darshini@paytm",
      lang: "kn",
      soundboxId: "SB-7781",
      payoutAccount: { bank: "Canara Bank", accountNo: "110023456789", ifsc: "CNRB0000456", holderName: "MANJUNATH K" },
      kyc: { status: "VERIFIED", panName: "MANJUNATH K", pan: "ABKPM1234C", issues: [] },
      risk: { flags: [] },
    });
    add(this.merchants, "M1002", {
      id: "M1002",
      owner: "Priya Sharma",
      business: "Priya Fashions",
      area: "Indiranagar 100ft Rd, Bengaluru",
      phone: "+91 99001 23456",
      vpa: "priyafashions@paytm",
      lang: "hi",
      soundboxId: "SB-4410",
      payoutAccount: { bank: "HDFC Bank", accountNo: "50200012349876", ifsc: "HDFC0001234", holderName: "PRIYA FASHIONS PROP PRIYA SHARMA" },
      kyc: { status: "RE_VERIFICATION_REQUIRED", panName: "PRIYA SHARMA", pan: "BQRPS5678K", issues: ["Bank account holder name differs from PAN name"] },
      risk: { flags: [] },
    });
    add(this.merchants, "M1003", {
      id: "M1003",
      owner: "Arjun Rao",
      business: "Arjun Electronics",
      area: "SP Road, Bengaluru",
      phone: "+91 98860 77441",
      vpa: "arjunelectronics@paytm",
      lang: "en",
      soundboxId: "SB-2290",
      payoutAccount: { bank: "ICICI Bank", accountNo: "002301556677", ifsc: "ICIC0000023", holderName: "ARJUN RAO" },
      kyc: { status: "VERIFIED", panName: "ARJUN RAO", pan: "AHGPR4321L", issues: [] },
      risk: { flags: [] },
    });
    add(this.merchants, "M1004", {
      id: "M1004",
      owner: "Ravi Kumar",
      business: "QuickMart Daily Needs",
      area: "Whitefield, Bengaluru",
      phone: "+91 90080 55123",
      vpa: "quickmart.wf@paytm",
      lang: "en",
      soundboxId: "SB-9902",
      payoutAccount: { bank: "SBI", accountNo: "38291045566", ifsc: "SBIN0040123", holderName: "RAVI KUMAR" },
      kyc: { status: "VERIFIED", panName: "RAVI KUMAR", pan: "CKLPK9988Q", issues: [] },
      risk: {
        flags: [
          { code: "SIM_SWAP_RECENT", severity: "high", note: "Registered mobile SIM re-issued 9 hours ago", at: t - 9 * HOUR },
          { code: "NEW_DEVICE_LOGIN", severity: "medium", note: "Login from new Android device, Kolkata IP", at: t - 40 * MIN },
        ],
      },
    });
    add(this.merchants, "M1005", {
      id: "M1005",
      owner: "Fatima Begum",
      business: "Noor Medicals",
      area: "Shivajinagar, Bengaluru",
      phone: "+91 97411 30987",
      vpa: "noormedicals@paytm",
      lang: "hi",
      soundboxId: "SB-5127",
      payoutAccount: { bank: "Axis Bank", accountNo: "917010045671234", ifsc: "UTIB0000789", holderName: "FATIMA BEGUM" },
      kyc: { status: "VERIFIED", panName: "FATIMA BEGUM", pan: "DFGPB2468M", issues: [] },
      risk: { flags: [] },
    });

    // Manjunath's morning: a handful of good payments, then the stuck ₹480.
    const breakfast = [
      [60, "suresh.b@okhdfcbank", "Suresh B", 38 * MIN],
      [120, "kavya.n@ybl", "Kavya N", 31 * MIN],
      [85, "deepak99@paytm", "Deepak", 22 * MIN],
      [40, "lakshmi.s@oksbi", "Lakshmi S", 15 * MIN],
      [150, "manoj.t@okicici", "Manoj T", 9 * MIN],
    ] as const;
    for (const [amount, vpa, name, ago] of breakfast) {
      const id = this.id("TXN");
      this.txns.set(id, {
        txnId: id,
        rrn: String(630411000000 + this.seq * 131),
        merchantId: "M1001",
        payerVpa: vpa,
        payerName: name,
        amount,
        ts: t - ago,
        payerDebit: "SUCCESS",
        beneficiaryCredit: "SUCCESS",
        creditedAt: t - ago + 2000,
        soundboxAnnounced: true,
        bankStatus: "CREDITED",
      });
    }
    this.txns.set("TXN-0480", {
      txnId: "TXN-0480",
      rrn: "630412345678",
      merchantId: "M1001",
      payerVpa: "ramesh.k@okaxis",
      payerName: "Ramesh K",
      amount: 480,
      ts: t - 3 * MIN,
      payerDebit: "SUCCESS",
      beneficiaryCredit: "PENDING",
      soundboxAnnounced: false,
      bankStatus: "CREDIT_PENDING_AT_BENEFICIARY",
    });

    this.settlements.set("STL-88213", {
      batchId: "STL-88213",
      merchantId: "M1002",
      amount: 184300,
      txnCount: 96,
      status: "ON_HOLD",
      holdReason: "BANK_NAME_MISMATCH",
      heldSince: t - 2 * DAY,
    });
    this.settlements.set("STL-88190", {
      batchId: "STL-88190",
      merchantId: "M1001",
      amount: 6240,
      txnCount: 71,
      status: "SETTLED",
      settledAt: t - 10 * HOUR,
      utr: "UTR88190001",
    });

    this.txns.set("TXN-12499", {
      txnId: "TXN-12499",
      rrn: "630098765432",
      merchantId: "M1003",
      payerVpa: "vikram.m@okhdfcbank",
      payerName: "Vikram M",
      amount: 12499,
      ts: t - 3 * DAY - 4 * HOUR,
      payerDebit: "SUCCESS",
      beneficiaryCredit: "SUCCESS",
      creditedAt: t - 3 * DAY - 4 * HOUR + 1500,
      soundboxAnnounced: true,
      bankStatus: "CREDITED",
    });
    this.disputes.set("DSP-55102", {
      disputeId: "DSP-55102",
      merchantId: "M1003",
      txnId: "TXN-12499",
      amount: 12499,
      reason: "Goods/services not received (payer claim)",
      raisedAt: t - 1 * DAY,
      deadline: t + 1 * DAY + 6 * HOUR,
      status: "OPEN",
      evidenceFiled: [],
    });
    const ev: Omit<Evidence, "disputeId">[] = [
      { id: "EV-QR-1", kind: "QR_SCAN_LOG", summary: "Static QR QR-2290-A scanned by payer device at counter, SP Road", ts: t - 3 * DAY - 4 * HOUR - 30_000 },
      { id: "EV-AUTH-1", kind: "PAYER_AUTH", summary: "Payer authenticated with UPI PIN on registered device; issuer response 00", ts: t - 3 * DAY - 4 * HOUR },
      { id: "EV-SB-1", kind: "SOUNDBOX_ANNOUNCEMENT", summary: "Soundbox SB-2290 announced ₹12,499 received, 2s after credit", ts: t - 3 * DAY - 4 * HOUR + 3500 },
      { id: "EV-INV-1", kind: "INVOICE", summary: "GST invoice INV/2610/1187 — 1× Bluetooth soundbar, handed over at counter", ts: t - 3 * DAY - 4 * HOUR + 60_000 },
      { id: "EV-GEO-1", kind: "DEVICE_GEO", summary: "Payer device within 15 m of merchant location at payment time", ts: t - 3 * DAY - 4 * HOUR },
    ];
    for (const e of ev) this.evidence.set(e.id, { ...e, disputeId: "DSP-55102" });

    this.settlements.set("STL-88250", {
      batchId: "STL-88250",
      merchantId: "M1004",
      amount: 42300,
      txnCount: 210,
      status: "PROCESSING",
    });
  }
}

/** Next occurrence of hh:mm IST strictly after `from`. */
export function nextAt(from: number, hh: number, mm: number) {
  const ist = 5.5 * HOUR;
  const dayStart = Math.floor((from + ist) / DAY) * DAY - ist;
  let at = dayStart + hh * HOUR + mm * MIN;
  if (at <= from) at += DAY;
  return at;
}

export function fmtIST(ts: number) {
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
