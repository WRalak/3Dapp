import { randomUUID } from "node:crypto";
import { env } from "@/config/env";
import { verifyTimestampedSignature } from "../signatures";
import { WebhookVerificationError, type PaymentAdapter } from "../types";

/**
 * Development/test provider. It behaves like a hosted checkout: the customer is sent to
 * /checkout/sandbox/<paymentId>, and approval produces an HMAC-signed webhook that travels
 * through the exact same verification + fulfilment pipeline as real providers.
 * Refuses to run in production (enforced in env validation).
 */
export const sandboxAdapter: PaymentAdapter = {
  id: "SANDBOX",
  label: "Test payment (sandbox)",
  isEnabled: () => {
    const e = env();
    return e.PAYMENT_SANDBOX_ENABLED && !!e.SANDBOX_WEBHOOK_SECRET && e.NODE_ENV !== "production";
  },

  async initiate(ctx) {
    return {
      providerReference: `sbx_${randomUUID()}`,
      status: "REQUIRES_ACTION",
      redirectUrl: `/checkout/sandbox/${ctx.paymentId}`,
    };
  },

  async verifyWebhook(req) {
    const secret = env().SANDBOX_WEBHOOK_SECRET;
    if (!secret || !verifyTimestampedSignature(secret, req.rawBody, req.headers.get("x-sandbox-signature"))) {
      throw new WebhookVerificationError();
    }
    const event = JSON.parse(req.rawBody) as {
      id: string;
      type: "payment.succeeded" | "payment.failed";
      data: { paymentId: string; reference: string; amountCents: number; currency: string; reason?: string };
    };
    return {
      eventId: event.id,
      type: event.type,
      outcome: event.type === "payment.succeeded" ? "succeeded" : "failed",
      paymentId: event.data.paymentId,
      providerReference: event.data.reference,
      amountCents: event.data.amountCents,
      currency: event.data.currency,
      failureReason: event.data.reason,
    };
  },

  async fetchStatus() {
    return { outcome: "pending" };
  },

  async refund() {
    return { status: "SUCCEEDED", providerReference: `sbx_rf_${randomUUID()}` };
  },
};
