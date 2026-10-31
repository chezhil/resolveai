// Real WhatsApp channel via Twilio (sandbox or a production sender).
// Inbound: Twilio posts the webhook, we verify its signature, transcribe voice notes with Sarvam,
// and open a case in the WhatsApp room as the configured demo merchant.
// Outbound: agent messages to that merchant are sent back to the phone that wrote in.

import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { ChatMessage } from "../core/types.js";
import type { Room } from "../rooms.js";
import { getRoom, cleanRoomId } from "../rooms.js";
import { sarvamEnabled, transcribe } from "../voice/sarvam.js";

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886 (Twilio sandbox)
export const WHATSAPP_ROOM = cleanRoomId(process.env.WHATSAPP_ROOM ?? "whatsapp");
const MERCHANT = process.env.WHATSAPP_MERCHANT_ID ?? "M1001";

export const whatsappEnabled = () => !!(SID && TOKEN && FROM);

/** Merchant id → the real phone that is playing that merchant in this room. */
const phones = new Map<string, string>();

/** Twilio request validation: HMAC-SHA1 over the full URL plus sorted POST params. */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined, token = TOKEN) {
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function publicUrl(req: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "") + req.originalUrl;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? req.protocol;
  return `${proto}://${req.headers["x-forwarded-host"] ?? req.headers.host}${req.originalUrl}`;
}

async function send(to: string, body: string) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: FROM!, To: to, Body: body.slice(0, 1500) }),
  });
  if (!res.ok) console.warn(`[whatsapp] send failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function handleInbound(req: Request, res: Response) {
  if (!whatsappEnabled()) return res.status(503).send("WhatsApp channel not configured");
  const params = req.body as Record<string, string>;
  if (!validTwilioSignature(publicUrl(req), params, req.header("X-Twilio-Signature"))) return res.status(403).send("Bad signature");

  const from = params.From;
  let text = (params.Body ?? "").trim();
  const room = getRoom(WHATSAPP_ROOM);
  // One demo merchant serves every sender, so a second phone must not take over replies for a case
  // that another phone opened.
  const owner = phones.get(MERCHANT);
  const busy = [...room.rt.cases.values()].some((c) => c.merchantId === MERCHANT && !["RESOLVED", "ESCALATED", "FAILED_SAFE"].includes(c.status));
  if (owner && owner !== from && busy) {
    await send(from, "The demo merchant is busy with another conversation. Please try again in a few minutes.");
    return res.type("text/xml").send("<Response></Response>");
  }
  phones.set(MERCHANT, from);

  if (Number(params.NumMedia ?? 0) > 0 && String(params.MediaContentType0 ?? "").startsWith("audio/")) {
    if (!sarvamEnabled()) {
      await send(from, "Voice notes need Sarvam ASR on the server (SARVAM_API_KEY). Please type your message for now.");
      return res.type("text/xml").send("<Response></Response>");
    }
    const audio = await fetch(params.MediaUrl0, { headers: { Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}` } });
    const lang = room.rt.world.merchants.get(MERCHANT)?.lang;
    const t = await transcribe(Buffer.from(await audio.arrayBuffer()), params.MediaContentType0, lang);
    text = t.transcript;
  }
  if (text) {
    try {
      room.rt.inbound(MERCHANT, text.slice(0, 2000), "whatsapp");
    } catch (e) {
      await send(from, "We've received several messages from you; your case is already being worked on. We'll update you shortly.");
      console.warn(`[whatsapp] ${(e as Error).message}`);
    }
  }
  res.type("text/xml").send("<Response></Response>");
}

/** Called for every chat message in every room; forwards agent replies to the real phone. */
export function outbound(room: Room, m: ChatMessage) {
  if (!whatsappEnabled() || room.id !== WHATSAPP_ROOM || m.from !== "agent" || m.to !== "merchant") return;
  const merchantId = room.rt.cases.get(m.caseId)?.merchantId;
  const to = merchantId && phones.get(merchantId);
  if (!to) return;
  const body = m.gloss && m.lang !== "en" ? `${m.text}\n\n— ${m.gloss}` : m.text;
  send(to, body).catch((e) => console.warn(`[whatsapp] ${e.message}`));
}
