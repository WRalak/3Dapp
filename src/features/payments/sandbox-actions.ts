"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { action } from "@/lib/action";
import { env } from "@/config/env";
import { db } from "@/lib/db/prisma";
import { badRequest, notFound } from "@/lib/errors";
import { processWebhook } from "@/server/services/payment.service";
import { sandboxAdapter } from "./providers/sandbox";
import { signTimestampedPayload } from "./signatures";

/**
 * Simulates the sandbox provider's hosted page. The decision is turned into an HMAC-signed
 * webhook and pushed through the normal verification pipeline — exactly like a real gateway.
 */
export const sandboxDecisionAction = action(z.object({ paymentId: z.string(), approve: z.boolean() }), async ({ paymentId, approve }) => {
  if (!sandboxAdapter.isEnabled()) throw badRequest("Sandbox payments are disabled");
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment || payment.provider !== "SANDBOX") throw notFound("Payment");
  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: approve ? "payment.succeeded" : "payment.failed",
    data: { paymentId: payment.id, reference: payment.providerReference, amountCents: payment.amountCents, currency: payment.currency, reason: approve ? undefined : "Declined in sandbox" },
  });
  const headers = new Headers({ "x-sandbox-signature": signTimestampedPayload(env().SANDBOX_WEBHOOK_SECRET!, body) });
  const result = await processWebhook("SANDBOX", { rawBody: body, headers });
  if (result.status !== 200) throw badRequest("Sandbox webhook was rejected");
  return { redirectTo: `/orders/${payment.order.number}/confirmation` };
});
