// Indic voice: Sarvam (server-side) when configured, otherwise the browser's Web Speech APIs.

import { ROOM, api, type Lang } from "./api";

export const SPEECH_LANG: Record<Lang, string> = { kn: "kn-IN", hi: "hi-IN", en: "en-IN" };

let current: HTMLAudioElement | null = null;

export async function speak(text: string, lang: Lang, sarvam: boolean) {
  current?.pause();
  window.speechSynthesis?.cancel();
  if (sarvam) {
    try {
      const r = await api<{ audioBase64: string }>("/voice/tts", { text, lang });
      if (r.audioBase64) {
        current = new Audio(`data:audio/wav;base64,${r.audioBase64}`);
        await current.play();
        return "sarvam";
      }
    } catch {
      // fall through to the browser voice
    }
  }
  if (!("speechSynthesis" in window)) throw new Error("No speech synthesis available in this browser");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(SPEECH_LANG[lang].slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return "browser";
}

/** Record a voice note. Returns a stop() that resolves to the transcript. */
export async function startRecording(lang: Lang, sarvam: boolean): Promise<() => Promise<string>> {
  if (sarvam && navigator.mediaDevices?.getUserMedia && "MediaRecorder" in window) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    return () =>
      new Promise((resolve, reject) => {
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          const res = await fetch(`/api/voice/transcribe?lang=${lang}`, { method: "POST", headers: { "Content-Type": blob.type, "x-room": ROOM }, body: blob });
          const j = await res.json();
          if (!res.ok) reject(new Error(j.error ?? "Transcription failed"));
          else resolve(j.transcript as string);
        };
        rec.stop();
      });
  }
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SR) throw new Error("Voice input needs Chrome (Web Speech API) or SARVAM_API_KEY on the server.");
  const r = new SR();
  r.lang = SPEECH_LANG[lang];
  r.interimResults = false;
  let transcript = "";
  const done = new Promise<string>((resolve, reject) => {
    r.onresult = (e: any) => (transcript = e.results[0][0].transcript);
    r.onend = () => resolve(transcript);
    r.onerror = (e: any) => reject(new Error(e.error ?? "Speech recognition failed"));
  });
  r.start();
  return () => {
    r.stop();
    return done;
  };
}
