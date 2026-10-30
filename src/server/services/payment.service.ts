import "server-only";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { logError, logger } from "@/lib/logger";
import { randomToken } from "@/lib/security/crypto";
import type { AuthUser } from "@/lib/auth/guards";
import { getAdapter } from "@/features/payments/registry";
import { ProviderError, WebhookVerificationError, type VerifiedEvent, type WebhookRequest } from "@/features/payments/types";
import type { PaymentProvider } from "@/generated/prisma/enums";
import { appendStatus, failPayment, fulfilPayment, returnStock } from "./order.service";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

export interface PaymentNextStep {
  paymentId: string;
  status: "PENDING" | "REQUIRES_ACTION";
  redirectUrl?: string;
  instructions?: string;
}

/**
 * Creates a Payment row first (with its own idempotency key) and then asks the provider to
 * start the payment. If the provider call fails the payment is marked FAILED and the order
 * stays payable, so the customer can retry with the same or another method.
 */
export async function startPayment(orderId: string, provider: PaymentProvider, opts: { phone?: string | null } = {}): Promise<PaymentNextStep> {
  const adapter = getAdapter(provider);
  if (!adapter.isEnabled()) throw badRequest(`${adapter.label} is not available right now`);
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound("Order");
  if (order.status !== "PENDING_PAYMENT") throw badRequest("This order no longer needs payment");

  // Re-use an in-flight payment for the same provider to avoid duplicate charges.
  const inflight = await db.payment.findFirst({
    where: { orderId, provider, status: { in: ["PENDING", "REQUIRES_ACTION"] }, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (inflight && provider !== "MPESA") {
    return { paymentId: inflight.id, status: inflight.status as "PENDING" | "REQUIRES_ACTION", redirectUrl: inflight.redirectUrl ?? undefined };
  }

  const payment = await db.payment.create({
    data: { orderId, provider, amountCents: order.totalCents, currency: order.currency, idempotencyKey: `pay_${randomToken(18)}`, status: "PENDING" },
  });
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: "PENDING" } });

  try {
    const result = await adapter.initiate({
      paymentId: payment.id,
      orderNumber: order.number,
      amountCents: order.totalCents,
      currency: order.currency,
      customerEmail: order.email,
      customerName: order.customerName,
      phone: opts.phone ?? order.phone,
      description: `Atelier order ${order.number} (${order.items.length} item${order.items.length === 1 ? "" : "s"})`,
      idempotencyKey: payment.idempotencyKey,
      appUrl: env().APP_URL,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { providerReference: result.providerReference, status: result.status, redirectUrl: result.redirectUrl, metadata: (result.metadata ?? undefined) as object | undefined },
    });
    return { paymentId: payment.id, status: result.status, redirectUrl: result.redirectUrl, instructions: result.instructions };
  } catch (err) {
    const reason = err instanceof ProviderError ? err.message : "Payment provider unavailable";
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason } });
    await db.order.update({ where: { id: orderId }, data: { paymentStatus: "FAILED" } });
    logError(err, { where: "startPayment", provider, orderId });
    throw new AppError("PAYMENT", `${reason}. Please try again or choose another payment method.`);
  }
}

async function resolvePayment(provider: PaymentProvider, event: VerifiedEvent) {
  if (event.paymentId) {
    const p = await db.payment.findUnique({ where: { id: event.paymentId } });
    if (p && p.provider === provider) {
      // Cross-check the provider reference when both sides have one.
      if (p.providerReference && event.providerReference && p.providerReference !== event.providerReference && provider !== "PAYPAL") return null;
      return p;
    }
  }
  if (event.providerReference) return db.payment.findUnique({ where: { provider_providerReference: { provider, providerReference: event.providerReference } } });
  return null;
}

/**
 * Single entry point for every provider webhook/callback:
 * verify signature → dedupe by (provider, eventId) → apply outcome → mark processed.
 */
export async function processWebhook(provider: PaymentProvider, req: WebhookRequest) {
  const adapter = getAdapter(provider);
  let event: VerifiedEvent;
  try {
    event = await adapter.verifyWebhook(req);
  } catch (err) {
    if (err instanceof WebhookVerificationError || err instanceof SyntaxError) {
      logger.warn({ provider, reason: err.message }, "rejected payment webhook");
      return { status: 400 as const, body: { error: "Invalid signature" } };
    }
    throw err;
  }

  let recorded;
  try {
    recorded = await db.paymentEvent.create({
      data: { provider, eventId: event.eventId, type: event.type, signatureValid: true, payload: JSON.parse(req.rawBody) as object },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { status: 200 as const, body: { received: true, duplicate: true } };
    throw err;
  }

  try {
    if (event.outcome !== "ignored" && event.outcome !== "pending") {
      const payment = await resolvePayment(provider, event);
      if (!payment) throw new Error("No matching payment for event");
      if (event.outcome === "succeeded") {
        await fulfilPayment(payment.id, { amountCents: event.amountCents, currency: event.currency, metadata: event.metadata });
      } else {
        await failPayment(payment.id, event.failureReason ?? "Payment failed");
      }
    }
    await db.paymentEvent.update({ where: { id: recorded.id }, data: { processedAt: new Date() } });
    return { status: 200 as const, body: { received: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.paymentEvent.update({ where: { id: recorded.id }, data: { error: message.slice(0, 1000) } });
    logError(err, { where: "processWebhook", provider, eventId: event.eventId });
    // Amount mismatches etc. are permanent — acknowledge so the provider stops retrying.
    if (err instanceof AppError) return { status: 200 as const, body: { received: true, error: "rejected" } };
    return { status: 500 as const, body: { error: "Processing failed" } };
  }
}

/** Asks the provider for the truth about a payment (used by reconciliation jobs and polling). */
export async function reconcilePayment(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !["PENDING", "REQUIRES_ACTION"].includes(payment.status)) return payment?.status;
  const adapter = getAdapter(payment.provider);
  if (!adapter.isEnabled()) return payment.status;
  const status = await adapter.fetchStatus(payment);
  await db.payment.update({ where: { id: paymentId }, data: { lastCheckedAt: new Date() } });
  if (status.outcome === "succeeded") await fulfilPayment(paymentId, { amountCents: status.amountCents, metadata: status.metadata });
  if (status.outcome === "failed") await failPayment(paymentId, status.failureReason ?? "Payment failed");
  return status.outcome;
}

export async function refundOrder(input: { orderId: string; amountCents: number; reason: string; restock: boolean }, actor: AuthUser) {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } }, refunds: true, items: true },
  });
  if (!order) throw notFound("Order");
  const payment = order.payments[0];
  if (!payment) throw badRequest("This order has no captured payment to refund");
  const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountCents, 0);
  const refundable = payment.amountCents - refunded;
  if (input.amountCents > refundable) throw new AppError("VALIDATION", `At most ${(refundable / 100).toFixed(2)} can be refunded`, { amount: ["Exceeds refundable amount"] });

  const refund = await db.refund.create({
    data: { paymentId: payment.id, orderId: order.id, amountCents: input.amountCents, reason: input.reason, actorId: actor.id, status: "PENDING" },
  });

  let result;
  try {
    result = await getAdapter(payment.provider).refund(payment, input.amountCents, input.reason, `refund_${refund.id}`);
  } catch (err) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: err instanceof Error ? err.message : "Provider error" } });
    throw new AppError("PAYMENT", `Refund failed: ${err instanceof Error ? err.message : "provider error"}`);
  }

  const full = refunded + input.amountCents >= payment.amountCents;
  await db.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: { status: result.status, providerReference: result.providerReference, failureReason: result.failureReason },
    });
    if (result.status === "FAILED") return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED", ...(full ? { status: "REFUNDED" } : {}) } });
    if (full && order.status !== "REFUNDED") await appendStatus(tx, order.id, order.status, "REFUNDED", actor.id, input.reason);
    if (input.restock && full && ["PAID", "PROCESSING"].includes(order.status)) {
      for (const i of order.items) if (i.variantId) await returnStock(tx, i.variantId, i.quantity, order.id, actor.id, "Refunded before shipping");
    }
    if (order.userId) await notify(order.userId, "ORDER_UPDATE", "Refund issued", `A refund of ${(input.amountCents / 100).toFixed(2)} ${order.currency} was issued for ${order.number}.`, `/account/orders/${order.number}`, tx);
  });
  await audit(actor.id, "order.refunded", "Order", order.id, { amountCents: input.amountCents, provider: payment.provider, status: result.status });
  return result;
}
