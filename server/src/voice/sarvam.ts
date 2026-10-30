// Optional Sarvam AI adapter for Indic speech: ASR for merchant voice notes and TTS for replies.
// Enabled when SARVAM_API_KEY is set; the console falls back to the browser's speech APIs otherwise.

const BASE = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai";
const LANG: Record<string, string> = { kn: "kn-IN", hi: "hi-IN", en: "en-IN" };

export const sarvamEnabled = () => !!process.env.SARVAM_API_KEY;

export async function transcribe(audio: Buffer, mime: string, lang?: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "voice-note.webm");
  form.append("model", process.env.SARVAM_ASR_MODEL ?? "saarika:v2.5");
  if (lang && LANG[lang]) form.append("language_code", LANG[lang]);
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sarvam ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { transcript: String(j.transcript ?? ""), language: j.language_code as string | undefined };
}

export async function speak(text: string, lang: string) {
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 1500),
      target_language_code: LANG[lang] ?? "en-IN",
      model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v2",
      speaker: process.env.SARVAM_TTS_SPEAKER ?? "anushka",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { audioBase64: String(j.audios?.[0] ?? ""), format: "wav" };
}
