import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound, rateLimited } from "@/lib/errors";
import { limitBy } from "@/lib/security/rate-limit";
import type { RequestContext } from "@/lib/security/request";
import type { AuthUser } from "@/lib/auth/guards";
import { computeMarketplaceTotals, generateOrderNumber } from "@/features/orders/pricing";
import { resolveCommissionBps, settleSellerOrder } from "@/features/finance/settlement";
import type { AddressSnapshot } from "@/features/delivery/address";
import { normaliseKenyanPhone } from "@/lib/utils";
import { canTransition, ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { enqueue } from "@/server/jobs/queue";
import { buildCartView, clearCart, getRawCart } from "./cart.service";
import { commitSale, releaseStock, reserveStock, returnStock } from "./inventory.service";
import { notify } from "./notification.service";
import { audit } from "./audit.service";
import { invalidateCatalogCache } from "./catalog.service";
import { settlePaidOrder } from "./finance.service";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { checkoutSchema } from "@/lib/validation/checkout";

export const RESERVATION_MINUTES = 30;

type CheckoutData = z.output<typeof checkoutSchema>;

export async function appendStatus(tx: Tx, orderId: string, from: OrderStatus | null, to: OrderStatus, actorId: string | null, note?: string) {
  await tx.orderStatusHistory.create({ data: { orderId, fromStatus: from, toStatus: to, actorId, note } });
}

async function resolveAddress(input: CheckoutData, user: AuthUser | null): Promise<AddressSnapshot & { countyId: string }> {
  if (input.savedAddressId) {
    if (!user) throw badRequest("Sign in to use a saved address");
    const addr = await db.address.findFirst({ where: { id: input.savedAddressId, userId: user.id, deletedAt: null }, include: { county: true } });
    if (!addr) throw notFound("Address");
    if (!addr.countyId) throw new AppError("VALIDATION", "Please update this address with its county", { savedAddressId: ["Add a county to this address"] });
    return { fullName: addr.fullName, phone: addr.phone, countyId: addr.countyId, county: addr.county?.name, town: addr.town ?? addr.city, estate: addr.estate, building: addr.building, line1: addr.line1, directions: addr.directions, country: addr.country };
  }
  const a = input.address!;
  const county = await db.county.findUnique({ where: { id: a.countyId } });
  if (!county || !county.isActive) throw new AppError("VALIDATION", "Choose a valid county", { "address.countyId": ["Choose a valid county"] });
  return { fullName: a.fullName, phone: a.phone, countyId: county.id, county: county.name, town: a.town, estate: a.estate, building: a.building || null, line1: a.line1 || null, directions: a.directions || null, country: "KE" };
}

/**
 * Creates a marketplace order from the server-side cart: one parent Order (what the customer
 * pays) split into one SellerOrder per seller (what each seller fulfils and is paid for).
 * Prices, promotions, coupons, delivery fees, commission and tax are all recomputed from the
 * database — the client only submits choices. Stock is reserved atomically; the reservation
 * expires if payment never completes. Idempotent per `idempotencyKey`.
 */
export async function placeOrder(input: CheckoutData, user: AuthUser | null, ctx: RequestContext) {
  const rl = await limitBy("checkout", user?.id ?? ctx.ip);
  if (!rl.success) throw rateLimited();

  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const address = await resolveAddress(input, user);
  const cart = await getRawCart();
  const view = await buildCartView(cart, { countyId: address.countyId, town: address.town, selections: input.delivery });
  if (!cart || view.lines.length === 0) throw badRequest("Your bag is empty");
  if (view.issues.length) throw new AppError("OUT_OF_STOCK", view.issues.join(". "));
  const undeliverable = view.groups.filter((g) => !g.selected);
  if (undeliverable.length) {
    const g = undeliverable[0]!;
    throw new AppError(
      "VALIDATION",
      g.deliveryOptions.length ? `Choose a delivery option for ${g.sellerName}` : `${g.sellerName} doesn't deliver to ${address.town}, ${address.county} yet — remove their items or use another address`,
      { [`delivery.${g.sellerId}`]: ["Choose a delivery option"] },
    );
  }

  const e = env();
  const sellers = await db.seller.findMany({ where: { id: { in: view.groups.map((g) => g.sellerId) } }, select: { id: true, commissionRateBps: true } });
  const categories = await db.category.findMany({ where: { id: { in: [...new Set(view.lines.map((l) => l.categoryId))] } }, select: { id: true, commissionRateBps: true } });
  const sellerRate = new Map(sellers.map((x) => [x.id, x.commissionRateBps]));
  const categoryRate = new Map(categories.map((c) => [c.id, c.commissionRateBps]));

  const order = await db.$transaction(async (tx) => {
    const coupon = cart.couponCode ? await tx.coupon.findUnique({ where: { code: cart.couponCode } }) : null;
    if (coupon && user?.id && coupon.perUserLimit) {
      const used = await tx.couponRedemption.count({ where: { couponId: coupon.id, userId: user.id } });
      if (used >= coupon.perUserLimit) throw badRequest("You've already used this discount code");
    }
    const totals = computeMarketplaceTotals({
      lines: view.lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
      promotionDiscountCents: view.promotionDiscountCents,
      coupon,
      shippingCents: view.groups.reduce((s, g) => s + g.selected!.priceCents, 0),
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
        phone: normaliseKenyanPhone(input.phone) ?? input.phone,
        currency: e.STORE_CURRENCY,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        couponCode: totals.couponCode,
        shippingMethod: view.groups.length === 1 ? view.groups[0]!.selected!.name : `${view.groups.length} deliveries`,
        shippingAddress: address as unknown as Prisma.InputJsonObject,
        countyId: address.countyId,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
      },
    });

    for (const g of view.groups) {
      const opt = g.selected!;
      // Commission per line (category rates may differ), seller override wins.
      let commissionCents = 0;
      let baseCents = 0;
      for (const l of g.lines) {
        const rate = resolveCommissionBps(sellerRate.get(g.sellerId), categoryRate.get(l.categoryId), e.DEFAULT_COMMISSION_BPS);
        const s = settleSellerOrder({ merchandiseCents: l.lineTotalCents, sellerDiscountCents: l.sellerFunded ? l.promotionDiscountCents : 0, shippingCents: 0, rateBps: rate });
        commissionCents += s.commissionCents;
        baseCents += s.baseCents;
      }
      await tx.sellerOrder.create({
        data: {
          orderId: created.id,
          sellerId: g.sellerId,
          subtotalCents: g.merchandiseCents,
          discountCents: g.sellerFundedDiscountCents,
          shippingCents: opt.priceCents,
          totalCents: g.merchandiseCents - g.sellerFundedDiscountCents + opt.priceCents,
          commissionCents,
          sellerNetCents: baseCents - commissionCents + opt.priceCents,
          shippingMethodId: opt.methodId,
          shippingMethodName: opt.name,
          deliveryType: opt.type,
          etaMinDays: opt.etaMinDays,
          etaMaxDays: opt.etaMaxDays,
          items: {
            create: g.lines.map((l) => ({
              orderId: created.id,
              sellerId: g.sellerId,
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
    }

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

    if (user && input.saveAddress && input.address) {
      const a = input.address;
      const count = await tx.address.count({ where: { userId: user.id, deletedAt: null } });
      await tx.address.create({
        data: {
          userId: user.id,
          isDefault: count === 0,
          fullName: a.fullName,
          phone: a.phone,
          countyId: address.countyId,
          town: a.town,
          estate: a.estate,
          building: a.building || null,
          directions: a.directions || null,
          line1: a.line1 || a.estate,
          city: a.town,
          region: address.county,
          country: "KE",
        },
      });
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

    // M-Pesa only moves whole shillings (we charge the total rounded up), so compare at that precision.
    const expected = payment.provider === "MPESA" ? Math.ceil(payment.amountCents / 100) * 100 : payment.amountCents;
    if (evidence.amountCents != null && evidence.amountCents !== expected) {
      throw new AppError("PAYMENT", `Amount mismatch: expected ${expected}, received ${evidence.amountCents}`);
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
      await settlePaidOrder(tx, order.id);
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
      await tx.sellerOrder.updateMany({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
      await appendStatus(tx, order.id, "PENDING_PAYMENT", "CANCELLED", null, "Payment not completed in time");
      return true;
    });
    if (done) cancelled++;
  }
  return cancelled;
}

/** Staff fulfilment from the order page: applies the status to every seller order that can move. */
export async function updateFulfilment(
  input: { orderId: string; sellerOrderId?: string; status: "PROCESSING" | "SHIPPED" | "DELIVERED"; note?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string },
  actor: AuthUser,
) {
  const { updateSellerOrderStatus } = await import("./fulfilment.service");
  const subs = await db.sellerOrder.findMany({ where: { orderId: input.orderId, ...(input.sellerOrderId ? { id: input.sellerOrderId } : {}) } });
  if (!subs.length) throw notFound("Order");
  const movable = subs.filter((s) => canTransition(s.status, input.status));
  if (!movable.length) throw badRequest(`Nothing in this order can move to ${ORDER_STATUS_LABEL[input.status]}`);
  for (const so of movable) await updateSellerOrderStatus({ ...input, sellerOrderId: so.id }, actor);
}

/** Cancels an unpaid order (releasing stock). Paid orders must go through refundOrder. */
export async function cancelOrder(orderId: string, reason: string, actor: AuthUser | null) {
  await db.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId } });
    if (!o) throw notFound("Order");
    if (o.status !== "PENDING_PAYMENT") throw badRequest("Only unpaid orders can be cancelled directly — issue a refund for paid orders");
    await releaseOrderReservations(tx, o.id, `Cancelled: ${reason}`);
    await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date(), reservationExpiresAt: null } });
      await tx.sellerOrder.updateMany({ where: { orderId: o.id }, data: { status: "CANCELLED" } });
    await tx.payment.updateMany({ where: { orderId: o.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
    await appendStatus(tx, o.id, o.status, "CANCELLED", actor?.id ?? null, reason);
    if (o.userId) await notify(o.userId, "ORDER_UPDATE", "Order cancelled", `Order ${o.number} has been cancelled.`, `/account/orders/${o.number}`, tx);
  });
  if (actor) await audit(actor.id, "order.cancelled", "Order", orderId, { reason });
}

export { returnStock, releaseOrderReservations };

// ── Queries ───────────────────────────────────────────────────

export async function getOrderForViewer(number: string, viewer: AuthUser | null, guestOrderNumbers: string[] = []) {
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
  // Guest orders are viewable from the browser that placed them (signed cookie).
  const isGuestMatch = !order.userId && guestOrderNumbers.includes(order.number);
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
