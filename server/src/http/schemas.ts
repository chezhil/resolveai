// Request-body schemas for the write endpoints. Parse at the boundary, trust nothing from the client.

import { z } from "zod";

const merchantId = z.string().trim().regex(/^M\d{3,6}$/, "merchantId must look like M1001");
const MAX_MINUTES = 60 * 24 * 7;

export const InboundBody = z.object({
  merchantId,
  text: z.string().trim().min(1, "text is required").max(4000),
  channel: z.enum(["whatsapp", "in-app", "ivr", "soundbox", "event"]).default("whatsapp"),
});

export const StuckPaymentBody = z.object({
  merchantId: merchantId.default("M1005"),
  amount: z.coerce.number().finite().positive().max(10_000_000).default(2350),
});

export const ApprovalBody = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  by: z.string().trim().min(1).max(40).optional(),
  pin: z.string().max(64).optional(),
});

export const ConfigBody = z.object({
  brain: z.enum(["auto", "llm", "planner"]).optional(),
  shadow: z.boolean().optional(),
  chaosModelOutage: z.boolean().optional(),
});

export const ClockBody = z.object({
  minutes: z.coerce.number().int().min(1).max(MAX_MINUTES).default(10),
});

const lang = z.string().regex(/^[a-z]{2}$/, "language must be a 2-letter code like hi");
export const TranslateBody = z.object({ text: z.string().trim().min(1).max(1000), from: lang.default("en"), to: lang });

export const LateReversalBody = z.object({ txnId: z.string().trim().regex(/^TXN-\d{4,}$/, "txnId must look like TXN-0001") });

export const CsatBody = z.object({
  score: z.coerce.number().int().min(1).max(5),
});

/** Parse a body, treating a missing body as `{}` so defaults apply. */
export const parseBody = <S extends z.ZodType>(schema: S, body: unknown): z.infer<S> => schema.parse(body ?? {});
