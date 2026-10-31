// Sarvam AI adapter for Indic language: speech-to-text for voice notes, text-to-speech for replies,
// and text translation so the agent's replies can reach any supported Indian language.
// Enabled when SARVAM_API_KEY is set; the console falls back to the browser's speech APIs otherwise.
// Not yet exercised against the live API from this repo: model ids are overridable by env.

const BASE = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai";

/** Console language code -> Sarvam BCP-47 code. */
export const SARVAM_LANGS: Record<string, { code: string; name: string; native: string }> = {
  en: { code: "en-IN", name: "English", native: "English" },
  hi: { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  kn: { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  ta: { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  te: { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  ml: { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  mr: { code: "mr-IN", name: "Marathi", native: "मराठी" },
  bn: { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  gu: { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  pa: { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  od: { code: "od-IN", name: "Odia", native: "ଓଡ଼ିଆ" },
};

const LANG = Object.fromEntries(Object.entries(SARVAM_LANGS).map(([k, v]) => [k, v.code]));

export const sarvamEnabled = () => !!process.env.SARVAM_API_KEY;

export const sarvamModels = () => ({
  asr: process.env.SARVAM_ASR_MODEL ?? "saaras:v3",
  tts: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
  translate: process.env.SARVAM_TRANSLATE_MODEL ?? "mayura:v1",
  chat: process.env.SARVAM_CHAT_MODEL ?? "sarvam-105b",
});

const headers = (json = false): Record<string, string> => ({
  "api-subscription-key": process.env.SARVAM_API_KEY!,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

export async function transcribe(audio: Buffer, mime: string, lang?: string) {
  const form = new FormData();
  const ext = mime.split(";")[0].split("/")[1]?.replace("x-", "") || "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `voice-note.${ext}`);
  form.append("model", sarvamModels().asr);
  if (lang && LANG[lang]) form.append("language_code", LANG[lang]);
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Sarvam ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { transcript: String(j.transcript ?? ""), language: j.language_code as string | undefined };
}

export async function speak(text: string, lang: string) {
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      text: text.slice(0, 1500),
      target_language_code: LANG[lang] ?? "en-IN",
      model: sarvamModels().tts,
      // "anushka" (the bulbul:v2 default) was dropped in bulbul:v3; "priya" exists on v3.
      speaker: process.env.SARVAM_TTS_SPEAKER ?? "priya",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { audioBase64: String(j.audios?.[0] ?? ""), format: "wav" };
}

/** Translate text between supported languages (console codes, e.g. "en" -> "ta"). */
export async function translate(text: string, from: string, to: string) {
  if (!LANG[to]) throw new Error(`Unsupported target language ${to}`);
  if (from === to) return { text, model: "passthrough" };
  const res = await fetch(`${BASE}/translate`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      input: text.slice(0, 1000),
      source_language_code: LANG[from] ?? "auto",
      target_language_code: LANG[to],
      model: sarvamModels().translate,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Sarvam translate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: String(j.translated_text ?? ""), model: sarvamModels().translate };
}
