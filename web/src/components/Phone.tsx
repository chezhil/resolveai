import { useEffect, useRef, useState } from "react";
import type { Announcement, Case, ChatMessage, Merchant } from "../lib/api";
import { api, fmtClock } from "../lib/api";
import { speak, startRecording } from "../lib/voice";
import { Button, Pill, cx } from "./ui";

interface PhoneProps {
  merchant?: Merchant;
  messages: ChatMessage[];
  cases: Case[];
  sarvam: boolean;
  onSent?: (caseId: string) => void;
}

export function Phone({ merchant, messages, cases, sarvam, onSent }: PhoneProps) {
  const [text, setText] = useState("");
  const [gloss, setGloss] = useState(true);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  const stopRef = useRef<null | (() => Promise<string>)>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [messages.length]);

  if (!merchant) return null;
  const thread = messages.filter((m) => m.from === "merchant" || m.to === "merchant");

  const send = async () => {
    if (!text.trim()) return;
    setErr("");
    try {
      const r = await api<{ caseId: string }>("/inbound", { merchantId: merchant.id, text, channel: "whatsapp" });
      setText("");
      onSent?.(r.caseId);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const listen = async () => {
    setErr("");
    if (listening && stopRef.current) {
      const stop = stopRef.current;
      stopRef.current = null;
      setListening(false);
      try {
        const t = await stop();
        if (t) setText(t);
      } catch (e) {
        setErr((e as Error).message);
      }
      return;
    }
    try {
      stopRef.current = await startRecording(merchant.lang, sarvam);
      setListening(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const play = (m: ChatMessage) => speak(m.text, m.lang, sarvam).catch((e) => setErr((e as Error).message));
  const rate = (caseId: string, score: number) => api(`/cases/${caseId}/csat`, { score }).catch((e) => setErr((e as Error).message));
  // Offer the one-tap rating under the last agent message of a verified case.
  const lastAgent = new Map<string, string>();
  for (const m of thread) if (m.from === "agent") lastAgent.set(m.caseId, m.id);
  const caseOf = (id: string) => cases.find((c) => c.id === id);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-[#0b5e54] px-3 py-2 text-white">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-sun font-display text-sm font-semibold text-ink">{merchant.owner[0]}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{merchant.business}</div>
          <div className="truncate text-[11px] opacity-80">WhatsApp · Paytm for Business</div>
        </div>
        <button className="label cursor-pointer rounded border border-white/40 px-1.5 py-0.5 text-[9.5px]" onClick={() => setGloss(!gloss)}>
          {gloss ? "EN on" : "EN off"}
        </button>
      </div>
      <div ref={box} className="scroll-thin h-[300px] space-y-2 overflow-y-auto bg-[#ece5dd] p-3">
        {thread.length === 0 && <div className="mt-24 text-center text-xs text-muted">No messages yet</div>}
        {thread.map((m) => (
          <div key={m.id} className={cx("rise flex", m.from === "merchant" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[86%] rounded-[10px] border border-line px-2.5 py-1.5 text-[13px] leading-snug shadow-sm", m.from === "merchant" ? "bg-[#d9fdd3]" : "bg-white")}>
              {m.from !== "merchant" && <div className="mb-0.5 text-[10.5px] font-bold text-brand">ResolveAI</div>}
              {m.channel === "whatsapp" && m.from === "merchant" && /maadidru|helilla/.test(m.text) && <div className="mb-1 text-[10.5px] text-muted">🎙 Voice note · transcribed</div>}
              <div className="whitespace-pre-wrap">{m.text}</div>
              {gloss && m.gloss && m.lang !== "en" && <div className="mt-1 border-t border-line pt-1 text-[11.5px] italic text-muted">{m.gloss}</div>}
              <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-muted">
                {m.from === "agent" && (
                  <button className="cursor-pointer text-brand" onClick={() => play(m)} title={sarvam ? "Play with Sarvam TTS" : "Play with browser voice"}>
                    ▶ listen
                  </button>
                )}
                {fmtClock(m.simTs)}
              </div>
              {lastAgent.get(m.caseId) === m.id && caseOf(m.caseId)?.status === "RESOLVED" && !caseOf(m.caseId)?.csat && (
                <div className="mt-1 flex items-center gap-1 border-t border-line pt-1">
                  <span className="text-[10.5px] text-muted">Rate:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => rate(m.caseId, n)} className="cursor-pointer text-base leading-none text-sun hover:scale-125" aria-label={`${n} stars`}>
                      ★
                    </button>
                  ))}
                </div>
              )}
              {lastAgent.get(m.caseId) === m.id && !!caseOf(m.caseId)?.csat && (
                <div className="mt-1 text-[10.5px] text-muted">Rated {"★".repeat(caseOf(m.caseId)!.csat!)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-t-2 border-line bg-white p-2">
        <button title={listening ? "Stop and transcribe" : sarvam ? "Record a voice note (Sarvam ASR)" : "Speak (browser speech recognition)"} onClick={listen} className={cx("chunky grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-sm", listening ? "bg-ember" : "bg-sun")}>
          {listening ? "■" : "🎙"}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Message as ${merchant.owner.split(" ")[0]}…`}
          className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        />
        <Button tone="ink" size="sm" onClick={send}>
          Send
        </Button>
      </div>
      {err && <div className="border-t border-line bg-ember/10 px-3 py-1.5 text-xs">{err}</div>}
    </div>
  );
}

export function PayerPhone({ messages }: { messages: ChatMessage[] }) {
  const thread = messages.filter((m) => m.to === "payer");
  if (!thread.length) return null;
  return (
    <div className="card p-3">
      <div className="label mb-2 text-muted">Payer · Paytm app notification</div>
      {thread.map((m) => (
        <div key={m.id} className="rise mb-1.5 rounded-lg bg-sky/20 px-2.5 py-1.5 text-[12.5px]">
          {m.text}
        </div>
      ))}
    </div>
  );
}

export function Soundbox({ merchant, announcements, live, sarvam }: { merchant?: Merchant; announcements: Announcement[]; live: Announcement | null; sarvam: boolean }) {
  const [voice, setVoice] = useState(false);
  const mine = announcements.filter((a) => a.merchantId === merchant?.id);
  const last = mine.at(-1);
  const fresh = !!live && live.merchantId === merchant?.id && live.ts === last?.ts;

  useEffect(() => {
    if (!fresh || !voice || !live) return;
    speak(live.text, merchant?.lang ?? "en", sarvam).catch(() => {});
  }, [fresh, voice, live, merchant?.lang, sarvam]);

  if (!merchant) return null;
  return (
    <div className="card flex items-center gap-3 p-3">
      <div className={cx("relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-line bg-ink", fresh && "ring-pulse")}>
        <div className="grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-[radial-gradient(circle,#3a3f66_1px,transparent_1.5px)] [background-size:5px_5px]">
          <span className={cx("h-2.5 w-2.5 rounded-full", last ? "bg-mint" : "bg-white/30")} />
        </div>
        <span className="absolute -bottom-2 rounded bg-sun px-1 font-mono text-[9px] font-bold">{merchant.soundboxId}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="label text-muted">Soundbox</span>
          <button className="label cursor-pointer text-brand" onClick={() => setVoice(!voice)} title="Speak announcements aloud">
            {voice ? "🔊 voice on" : "🔈 voice off"}
          </button>
        </div>
        {last ? (
          <>
            <div className="truncate text-[15px] font-semibold">{last.text}</div>
            <div className="text-[11px] text-muted">{fmtClock(last.ts)} · announced on credit</div>
          </>
        ) : (
          <div className="text-sm text-muted">Silent. Waiting for a credit…</div>
        )}
      </div>
      {fresh && <Pill tone="mint">Live</Pill>}
    </div>
  );
}
