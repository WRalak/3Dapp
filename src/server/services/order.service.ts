import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound, rateLimited } from "@/lib/errors";
import { limitBy } from "@/lib/security/rate-limit";
import type { RequestContext } from "@/lib/security/request";
import type { AuthUser } from "@/lib/auth/guards";
import { computeTotals, generateOrderNumber } from "@/features/orders/pricing";
import { canTransition, ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { enqueue } from "@/server/jobs/queue";
import { buildCartView, clearCart, getRawCart } from "./cart.service";
import { commitSale, releaseStock, reserveStock, returnStock } from "./inventory.service";
import { notify } from "./notification.service";
import { audit } from "./audit.service";
import { invalidateCatalogCache } from "./catalog.service";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { checkoutSchema } from "@/lib/validation/checkout";

export const RESERVATION_MINUTES = 30;

type CheckoutData = z.output<typeof checkoutSchema>;

export async function appendStatus(tx: Tx, orderId: string, from: OrderStatus | null, to: OrderStatus, actorId: string | null, note?: string) {
  await tx.orderStatusHistory.create({ data: { orderId, fromStatus: from, toStatus: to, actorId, note } });
}

/**
 * Creates an order from the server-side cart. Prices, discounts, shipping and tax are all
 * recomputed from the database — nothing price-related is accepted from the client.
 * Stock is reserved atomically; the reservation expires if payment never completes.
 * Idempotent per `idempotencyKey`, so double-submits return the same order.
 */
export async function placeOrder(input: CheckoutData, user: AuthUser | null, ctx: RequestContext) {
  const rl = await limitBy("checkout", user?.id ?? ctx.ip);
  if (!rl.success) throw rateLimited();

  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const cart = await getRawCart();
  const view = await buildCartView(cart, input.shippingMethod);
  if (!cart || view.lines.length === 0) throw badRequest("Your bag is empty");
  if (view.issues.length) throw new AppError("OUT_OF_STOCK", view.issues.join(". "));

  let shippingAddress: Prisma.InputJsonValue;
  if (input.shippingMethod === "pickup") {
    shippingAddress = { pickup: true, fullName: input.customerName, phone: input.phone };
  } else if (input.savedAddressId) {
    if (!user) throw badRequest("Sign in to use a saved address");
    const addr = await db.address.findFirst({ where: { id: input.savedAddressId, userId: user.id, deletedAt: null } });
    if (!addr) throw notFound("Address");
    shippingAddress = { fullName: addr.fullName, phone: addr.phone, line1: addr.line1, line2: addr.line2, city: addr.city, region: addr.region, postalCode: addr.postalCode, country: addr.country };
  } else {
    shippingAddress = { ...input.address! };
  }

  const e = env();
  const order = await db.$transaction(async (tx) => {
    const coupon = cart.couponCode ? await tx.coupon.findUnique({ where: { code: cart.couponCode } }) : null;
    if (coupon && user?.id && coupon.perUserLimit) {
      const used = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId: user.id } });
      if (used >= coupon.perUserLimit) throw badRequest("You've already used this discount code");
    }
    const totals = computeTotals({
      lines: view.lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
      shippingMethod: input.shippingMethod,
      coupon,
      taxRateBps: e.TAX_RATE_BPS,
      taxInclusive: e.TAX_INCLUSIVE,
    });
    if (coupon && totals.couponError) throw badRequest(totals.couponError);

    const created = await tx.order.create({
      data: {
        number: generateOrderNumber(),
        userId: user?.id ?? null,
        email: input.email,
        customerName: input.customerName,
        phone: input.phone,
        currency: e.STORE_CURRENCY,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        couponCode: totals.couponCode,
        shippingMethod: input.shippingMethod,
        shippingAddress,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
        items: {
          create: view.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            productName: l.name,
            variantLabel: `${l.color} / ${l.size}`,
            sku: l.sku,
            imageUrl: l.image,
            unitPriceCents: l.unitPriceCents,
            quantity: l.quantity,
            totalCents: l.lineTotalCents,
          })),
        },
      },
    });

    for (const l of view.lines) await reserveStock(tx, l.variantId, l.quantity, created.id, `${l.name} (${l.size})`);

    if (coupon && totals.couponCode) {
      const claimed = await tx.$executeRaw`
        UPDATE "Coupon" SET "redemptionCount" = "redemptionCount" + 1
        WHERE id = ${coupon.id} AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")`;
      if (claimed === 0) throw badRequest("This discount code has been fully redeemed");
      await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: created.id, userId: user?.id ?? null } });
    }

    await appendStatus(tx, created.id, null, "PENDING_PAYMENT", user?.id ?? null, "Order placed");
    await clearCart(cart.id, tx);

    if (user && input.saveAddress && input.address && input.shippingMethod !== "pickup") {
      const count = await tx.address.count({ where: { userId: user.id, deletedAt: null } });
      await tx.address.create({ data: { ...input.address, userId: user.id, isDefault: count === 0, line2: input.address.line2 || null, region: input.address.region || null, postalCode: input.address.postalCode || null } });
    }

    await enqueue("orders.expireReservations", {}, { tx, runAt: new Date(Date.now() + (RESERVATION_MINUTES + 1) * 60_000) });
    return created;
  });

  return order;
}

/**
 * Marks an order paid. ONLY invoked from verified payment signals (webhooks, server-side
 * capture, reconciliation). Idempotent: a second call for the same payment is a no-op.
 */
export async function fulfilPayment(paymentId: string, evidence: { amountCents?: number; currency?: string; metadata?: Record<string, unknown> }) {
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
    if (!payment) throw notFound("Payment");
    if (payment.status === "SUCCEEDED") return { alreadyProcessed: true, order: payment.order };

    if (evidence.amountCents != null && evidence.amountCents !== payment.amountCents) {
      throw new AppError("PAYMENT", `Amount mismatch: expected ${payment.amountCents}, received ${evidence.amountCents}`);
    }
    if (evidence.currency && evidence.currency.toUpperCase() !== payment.currency) {
      throw new AppError("PAYMENT", "Currency mismatch");
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        succeededAt: new Date(),
        failureReason: null,
        metadata: { ...((payment.metadata as object) ?? {}), ...(evidence.metadata ?? {}) } as Prisma.InputJsonObject,
      },
    });

    const order = payment.order;
    if (order.status === "PENDING_PAYMENT") {
      for (const item of order.items) if (item.variantId) await commitSale(tx, item.variantId, item.quantity, order.id);
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paymentStatus: "PAID", paidAt: new Date(), reservationExpiresAt: null } });
      await appendStatus(tx, order.id, "PENDING_PAYMENT", "PAID", null, `Payment confirmed via ${payment.provider}`);
      for (const item of order.items) if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { salesCount: { increment: item.quantity } } });
      if (order.userId) await notify(order.userId, "ORDER_UPDATE", "Payment received", `Thank you — order ${order.number} is confirmed.`, `/account/orders/${order.number}`, tx);
      await enqueue("email.orderConfirmation", { orderId: order.id }, { tx });
      return { alreadyProcessed: false, order };
    }

    // Payment arrived after the order was cancelled (e.g. reservation expired). Record it and
    // flag for staff: they can refund, or re-open the order if stock allows.
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } });
    await tx.auditLog.create({
      data: { action: "payment.received_for_closed_order", entityType: "Order", entityId: order.id, metadata: { paymentId, status: order.status } },
    });
    return { alreadyProcessed: false, order, needsAttention: true };
  });
  if (!result.alreadyProcessed) await invalidateCatalogCache();
  return result;
}

export async function failPayment(paymentId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment || payment.status === "SUCCEEDED" || payment.status === "FAILED") return;
    await tx.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureReason: reason.slice(0, 500) } });
    if (payment.order.status === "PENDING_PAYMENT") {
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "FAILED" } });
      if (payment.order.userId) {
        await notify(payment.order.userId, "ORDER_UPDATE", "Payment unsuccessful", `We couldn't confirm payment for ${payment.order.number}. You can retry from your order page.`, `/orders/${payment.order.number}/confirmation`, tx);
      }
    }
  });
}

async function releaseOrderReservations(tx: Tx, orderId: string, reason: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const i of items) if (i.variantId) await releaseStock(tx, i.variantId, i.quantity, orderId, reason);
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (redemption) {
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { redemptionCount: { decrement: 1 } } });
    await tx.couponRedemption.delete({ where: { id: redemption.id } });
  }
}

/** Cancels unpaid orders whose reservation window has elapsed (after reconciling with providers). */
export async function expireStaleOrders(reconcile: (paymentId: string) => Promise<void>) {
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: new Date() } },
    include: { payments: { where: { status: { in: ["PENDING", "REQUIRES_ACTION"] } } } },
    take: 100,
  });
  let cancelled = 0;
  for (const order of stale) {
    for (const p of order.payments) await reconcile(p.id).catch(() => undefined);
    const done = await db.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: order.id } });
      if (!fresh || fresh.status !== "PENDING_PAYMENT") return false;
      await releaseOrderReservations(tx, order.id, "Reservation expired");
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date(), reservationExpiresAt: null } });
      await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
      await appendStatus(tx, order.id, "PENDING_PAYMENT", "CANCELLED", null, "Payment not completed in time");
      return true;
    });
    if (done) cancelled++;
  }
  return cancelled;
}

export async function updateFulfilment(
  input: { orderId: string; status: "PROCESSING" | "SHIPPED" | "DELIVERED"; note?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string },
  actor: AuthUser,
) {
  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!o) throw notFound("Order");
    if (!canTransition(o.status, input.status)) throw badRequest(`Cannot move an order from ${ORDER_STATUS_LABEL[o.status]} to ${ORDER_STATUS_LABEL[input.status]}`);
    await tx.order.update({ where: { id: o.id }, data: { status: input.status } });
    await appendStatus(tx, o.id, o.status, input.status, actor.id, input.note || undefined);
    if (input.status === "SHIPPED") {
      await tx.shipment.create({
        data: { orderId: o.id, carrier: input.carrier || "Courier", trackingNumber: input.trackingNumber || null, trackingUrl: input.trackingUrl || null, status: "IN_TRANSIT", shippedAt: new Date() },
      });
    }
    if (input.status === "DELIVERED") {
      await tx.shipment.updateMany({ where: { orderId: o.id, status: "IN_TRANSIT" }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    }
    if (o.userId) {
      const type = input.status === "PROCESSING" ? "ORDER_UPDATE" : "DELIVERY";
      await notify(o.userId, type, `Order ${ORDER_STATUS_LABEL[input.status].toLowerCase()}`, `Order ${o.number} is now ${ORDER_STATUS_LABEL[input.status].toLowerCase()}.`, `/account/orders/${o.number}`, tx);
    }
    await enqueue("email.orderStatus", { orderId: o.id, status: input.status }, { tx });
    return o;
  });
  await audit(actor.id, "order.status_updated", "Order", order.id, { to: input.status, tracking: input.trackingNumber });
}

/** Cancels an unpaid order (releasing stock). Paid orders must go through refundOrder. */
export async function cancelOrder(orderId: string, reason: string, actor: AuthUser | null) {
  await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) throw notFound("Order");
    if (o.status !== "PENDING_PAYMENT") throw badRequest("Only unpaid orders can be cancelled directly — issue a refund for paid orders");
    await releaseOrderReservations(tx, o.id, `Cancelled: ${reason}`);
    await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date(), reservationExpiresAt: null } });
    await tx.payment.updateMany({ where: { orderId: o.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
    await appendStatus(tx, o.id, o.status, "CANCELLED", actor?.id ?? null, reason);
    if (o.userId) await notify(o.userId, "ORDER_UPDATE", "Order cancelled", `Order ${o.number} has been cancelled.`, `/account/orders/${o.number}`, tx);
  });
  if (actor) await audit(actor.id, "order.cancelled", "Order", orderId, { reason });
}

export { returnStock, releaseOrderReservations };

// ── Queries ───────────────────────────────────────────────────

export async function getOrderForViewer(number: string, viewer: AuthUser | null, guestEmail?: string) {
  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      shipments: { orderBy: { createdAt: "desc" } },
      refunds: true,
    },
  });
  if (!order) return null;
  const isOwner = viewer && order.userId === viewer.id;
  const isStaff = viewer?.isStaff && viewer.permissions.includes("orders.view");
  const isGuestMatch = !order.userId && guestEmail && guestEmail.toLowerCase() === order.email;
  if (!isOwner && !isStaff && !isGuestMatch) return null;
  return order;
}

export async function listCustomerOrders(userId: string, take = 50) {
  return db.order.findMany({
    where: { userId },
    orderBy: { placedAt: "desc" },
    take,
    include: { items: { take: 3 }, _count: { select: { items: true } } },
  });
}
