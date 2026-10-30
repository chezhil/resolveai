// PII redaction: the model only ever sees placeholder tokens like <VPA_1>.
// Each case has its own vault, so tools can resolve a token back to the real value when they act.

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
  private byValue = new Map<string, string>();
  private byToken = new Map<string, string>();
  private counters: Record<string, number> = {};
  /** Values that look like PII but are safe operational ids (RRNs, txn ids). */
  constructor(private allow: Set<string> = new Set()) {}

  allowValue(v: string) {
    this.allow.add(v);
  }

  redact(text: string): string {
    let out = text;
    for (const { kind, re } of PATTERNS) {
      out = out.replace(re, (m) => {
        if (this.allow.has(m) || m.startsWith("<")) return m;
        const existing = this.byValue.get(m);
        if (existing) return existing;
        this.counters[kind] = (this.counters[kind] ?? 0) + 1;
        const token = `<${kind}_${this.counters[kind]}>`;
        this.byValue.set(m, token);
        this.byToken.set(token, m);
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
    return text.replace(/<([A-Z]+)_(\d+)>/g, (m) => this.byToken.get(m) ?? m);
  }

  get size() {
    return this.byToken.size;
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
