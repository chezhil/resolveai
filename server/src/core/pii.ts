// PII redaction: the model only ever sees placeholder tokens like <VPA_1>.
// Each case has its own vault, so tools can resolve a token back to the real value when they act.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g },
  { kind: "VPA", re: /\b[\w.-]{2,}@(?:paytm|ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|upi|apl)\b/gi },
  { kind: "AADHAAR", re: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g },
  { kind: "CARD", re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g },
  { kind: "PAN", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { kind: "PHONE", re: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g },
  { kind: "ACCOUNT", re: /\b\d{9,18}\b/g },
];

export class PiiVault {
  /** Per-case AES-256 key. Values are held only as AES-GCM ciphertext; the key is destroyed at close. */
  private key: Buffer | null = randomBytes(32);
  /** HMAC(value) → token, so the lookup index never holds plaintext either. */
  private byDigest = new Map<string, string>();
  private byToken = new Map<string, { iv: Buffer; ct: Buffer; tag: Buffer }>();
  private counters: Record<string, number> = {};
  shreddedAt: number | null = null;
  /** Values that look like PII but are safe operational ids (RRNs, txn ids). */
  constructor(private allow: Set<string> = new Set()) {}

  allowValue(v: string) {
    this.allow.add(v);
  }

  private digest(v: string) {
    return createHmac("sha256", this.key!).update(v).digest("base64url");
  }

  redact(text: string): string {
    let out = text;
    for (const { kind, re } of PATTERNS) {
      out = out.replace(re, (m) => {
        if (this.allow.has(m) || m.startsWith("<")) return m;
        // After shredding nothing new is stored: mask outright.
        if (!this.key) return `<${kind}_REDACTED>`;
        const d = this.digest(m);
        const existing = this.byDigest.get(d);
        if (existing) return existing;
        this.counters[kind] = (this.counters[kind] ?? 0) + 1;
        const token = `<${kind}_${this.counters[kind]}>`;
        const iv = randomBytes(12);
        const c = createCipheriv("aes-256-gcm", this.key, iv);
        const ct = Buffer.concat([c.update(m, "utf-8"), c.final()]);
        this.byDigest.set(d, token);
        this.byToken.set(token, { iv, ct, tag: c.getAuthTag() });
        return token;
      });
    }
    return out;
  }

  /** Deep-redact any JSON-ish value. */
  redactValue<T>(v: T): T {
    if (typeof v === "string") return this.redact(v) as T;
    if (Array.isArray(v)) return v.map((x) => this.redactValue(x)) as T;
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.redactValue(x)])) as T;
    }
    return v;
  }

  reveal(text: string) {
    return text.replace(/<([A-Z]+)_(\d+)>/g, (m) => {
      const e = this.byToken.get(m);
      if (!e || !this.key) return m;
      const d = createDecipheriv("aes-256-gcm", this.key, e.iv);
      d.setAuthTag(e.tag);
      return Buffer.concat([d.update(e.ct), d.final()]).toString("utf-8");
    });
  }

  /** Crypto-shred: drop the key and ciphertexts so no personal data outlives the case. */
  shred(at: number) {
    if (this.shreddedAt !== null) return false;
    this.key?.fill(0);
    this.key = null;
    this.byToken.clear();
    this.byDigest.clear();
    this.shreddedAt = at;
    return true;
  }

  get size() {
    return this.byToken.size;
  }

  stats() {
    return { items: Object.values(this.counters).reduce((a, b) => a + b, 0), cipher: "AES-256-GCM", shredded: this.shreddedAt !== null };
  }
}

/** Mask PII for display in UI and audit log without a vault (e.g. ****4521). */
export function mask(text: string) {
  return text
    .replace(/\b(\d{5,14})(\d{4})\b/g, (_, a: string, b: string) => `${"•".repeat(4)}${b}`)
    .replace(/\b([\w.-])[\w.-]*@(\w+)/g, "$1•••@$2");
}

/** Outgoing messages must not leak raw identifiers. Returns the offending kinds. */
export function findLeaks(text: string): string[] {
  const kinds = new Set<string>();
  for (const { kind, re } of PATTERNS) {
    if (kind === "VPA" || kind === "EMAIL") continue;
    re.lastIndex = 0;
    if (re.test(text)) kinds.add(kind);
  }
  return [...kinds];
}
