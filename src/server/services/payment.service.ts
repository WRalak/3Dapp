import "server-only";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { logError, logger } from "@/lib/logger";
import { randomToken } from "@/lib/security/crypto";
import { formatMoney, maskPhone } from "@/lib/utils";
import type { C2bPayload } from "@/features/payments/providers/mpesa-c2b";
import type { AuthUser } from "@/lib/auth/guards";
import { getAdapter } from "@/features/payments/registry";
import { ProviderError, WebhookVerificationError, type VerifiedEvent, type WebhookRequest } from "@/features/payments/types";
import type { PaymentProvider } from "@/generated/prisma/enums";
import { appendStatus, failPayment, fulfilPayment, returnStock } from "./order.service";
import { audit } from "./audit.service";
import { applySellerRefund } from "./finance.service";
import { allocateProportionally } from "@/features/finance/settlement";
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
      description: `Mtindo order ${order.number} (${order.items.length} item${order.items.length === 1 ? "" : "s"})`,
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
      if (provider === "MPESA") {
        const receipt = typeof event.metadata?.receipt === "string" ? event.metadata.receipt : null;
        await recordProviderTransaction({ paymentId: payment.id, provider, type: "CALLBACK", status: event.outcome, providerReference: event.providerReference, receipt, amountCents: event.amountCents ?? null });
      }
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

/**
 * Refunds a customer. With `sellerOrderId` the refund is charged to that seller's part of the
 * order (capped at what that seller order took); otherwise it is spread across seller orders
 * in proportion to their totals. Each seller's share is split between the seller (debit) and
 * the platform (commission reversal) in the ledger.
 */
export async function refundOrder(input: { orderId: string; sellerOrderId?: string; amountCents: number; reason: string; restock: boolean }, actor: AuthUser) {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } }, refunds: true, items: true, sellerOrders: true },
  });
  if (!order) throw notFound("Order");
  const payment = order.payments[0];
  if (!payment) throw badRequest("This order has no captured payment to refund");
  const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountCents, 0);
  const refundable = payment.amountCents - refunded;
  if (input.amountCents > refundable) throw new AppError("VALIDATION", `At most ${(refundable / 100).toFixed(2)} can be refunded`, { amount: ["Exceeds refundable amount"] });

  // Work out which seller orders bear the refund.
  const live = order.refunds.filter((r) => r.status !== "FAILED");
  const refundedOn = (soId: string) => live.filter((r) => r.sellerOrderId === soId).reduce((s, r) => s + r.amountCents, 0);
  let shares: { sellerOrderId: string; amountCents: number }[];
  if (input.sellerOrderId) {
    const so = order.sellerOrders.find((x) => x.id === input.sellerOrderId);
    if (!so) throw notFound("Seller order");
    const left = so.totalCents - refundedOn(so.id);
    if (input.amountCents > left) throw new AppError("VALIDATION", `At most ${(left / 100).toFixed(2)} can be refunded for this seller`, { amount: ["Exceeds this seller's share"] });
    shares = [{ sellerOrderId: so.id, amountCents: input.amountCents }];
  } else {
    const parts = allocateProportionally(input.amountCents, order.sellerOrders.map((so) => so.totalCents));
    shares = order.sellerOrders.map((so, i) => ({ sellerOrderId: so.id, amountCents: parts[i]! })).filter((x) => x.amountCents > 0);
  }

  const refund = await db.refund.create({
    data: { paymentId: payment.id, orderId: order.id, sellerOrderId: shares.length === 1 ? shares[0]!.sellerOrderId : null, amountCents: input.amountCents, reason: input.reason, actorId: actor.id, status: "PENDING" },
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
    for (const share of shares) {
      await applySellerRefund(tx, { sellerOrderId: share.sellerOrderId, refundId: refund.id, amountCents: share.amountCents, actorId: actor.id });
      const so = order.sellerOrders.find((x) => x.id === share.sellerOrderId)!;
      const soFull = refundedOn(so.id) + share.amountCents >= so.totalCents;
      if (soFull && so.status !== "REFUNDED") {
        await tx.sellerOrder.update({ where: { id: so.id }, data: { status: "REFUNDED" } });
        if (input.restock && ["PAID", "PROCESSING"].includes(so.status)) {
          for (const i of order.items) if (i.variantId && i.sellerOrderId === so.id) await returnStock(tx, i.variantId, i.quantity, order.id, actor.id, "Refunded before shipping");
        }
      }
    }
    if (order.userId) await notify(order.userId, "ORDER_UPDATE", "Refund issued", `A refund of ${formatMoney(input.amountCents, order.currency)} was issued for ${order.number}.`, `/account/orders/${order.number}`, tx);
  });
  await audit(actor.id, "order.refunded", "Order", order.id, { amountCents: input.amountCents, provider: payment.provider, status: result.status });
  return result;
}

// ─── M-Pesa C2B (Paybill: account number = order number) ───────────────────────

function kesToCents(amount: string | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

async function openOrderForAccount(account: string | undefined) {
  const number = (account ?? "").trim().toUpperCase();
  if (!/^MT-\d{6}-[A-Z0-9]{5}$/.test(number)) return null;
  return db.order.findFirst({ where: { number, status: "PENDING_PAYMENT" } });
}

/** Validation: accept only payments for an open order with the exact (rounded-up) amount. */
export async function validateC2b(p: C2bPayload): Promise<{ ok: boolean; code: string; reason: string }> {
  const order = await openOrderForAccount(p.BillRefNumber);
  if (!order) return { ok: false, code: "C2B00012", reason: "Invalid account number" };
  const due = Math.ceil(order.totalCents / 100) * 100;
  if (kesToCents(p.TransAmount) !== due) return { ok: false, code: "C2B00013", reason: "Invalid amount" };
  return { ok: true, code: "0", reason: "Accepted" };
}

/**
 * Confirmation: the money has moved. Recorded exactly once per TransID. If it matches an open
 * order it is fulfilled; otherwise it is kept for finance to reconcile (refund or allocate).
 */
export async function confirmC2b(p: C2bPayload) {
  if (!p.TransID || !/^[A-Z0-9]{8,20}$/i.test(p.TransID)) throw badRequest("Malformed confirmation");
  const amountCents = kesToCents(p.TransAmount);
  try {
    await db.paymentTransaction.create({
      data: { provider: "MPESA", type: "C2B_CONFIRMATION", status: "RECEIVED", receipt: p.TransID, phone: p.MSISDN ? maskPhone(`+${p.MSISDN}`) : null, amountCents: Number.isFinite(amountCents) ? amountCents : null, raw: { ...p, MSISDN: undefined, FirstName: undefined } as object },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { duplicate: true };
    throw err;
  }
  const order = await openOrderForAccount(p.BillRefNumber);
  const due = order ? Math.ceil(order.totalCents / 100) * 100 : null;
  if (!order || amountCents !== due) {
    await db.paymentTransaction.updateMany({ where: { provider: "MPESA", type: "C2B_CONFIRMATION", receipt: p.TransID }, data: { status: "UNMATCHED" } });
    await db.auditLog.create({ data: { action: "payment.c2b_unmatched", entityType: "PaymentTransaction", entityId: p.TransID, metadata: { account: p.BillRefNumber ?? null, amountCents } } });
    return { matched: false };
  }
  const payment = await db.payment.create({
    data: { orderId: order.id, provider: "MPESA", status: "PENDING", amountCents: order.totalCents, currency: order.currency, providerReference: p.TransID, idempotencyKey: `c2b_${p.TransID}`, metadata: { channel: "C2B", receipt: p.TransID } },
  });
  await db.paymentTransaction.updateMany({ where: { provider: "MPESA", type: "C2B_CONFIRMATION", receipt: p.TransID }, data: { paymentId: payment.id, status: "MATCHED" } });
  await fulfilPayment(payment.id, { amountCents, currency: "KES", metadata: { receipt: p.TransID, channel: "C2B" } });
  return { matched: true, orderId: order.id };
}

/** Records every provider interaction for reconciliation (receipts are unique per type). */
export async function recordProviderTransaction(input: { paymentId?: string | null; provider: PaymentProvider; type: "INITIATE" | "CALLBACK" | "STATUS_QUERY"; status: string; providerReference?: string | null; receipt?: string | null; amountCents?: number | null; raw?: object }) {
  await db.paymentTransaction.createMany({ data: [{ ...input, receipt: input.receipt ?? null }], skipDuplicates: true });
}
