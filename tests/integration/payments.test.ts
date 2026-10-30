import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetBrowser } from "../support/request-mock";
import { checkoutInput, createProduct, createUser, ensureRoles, testDb } from "../support/factories";
import { addToCart } from "@/server/services/cart.service";
import { placeOrder } from "@/server/services/order.service";
import { processWebhook, refundOrder, startPayment } from "@/server/services/payment.service";
import { signTimestampedPayload } from "@/features/payments/signatures";
import { createSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/guards";

const SECRET = process.env.SANDBOX_WEBHOOK_SECRET!;

beforeAll(ensureRoles);
beforeEach(() => resetBrowser(`198.18.0.${Math.floor(Math.random() * 250)}`));

async function pendingOrder(stock = 5, qty = 1) {
  const { variant, product } = await createProduct({ stock, priceCents: 10000 });
  await addToCart(variant.id, qty);
  const order = await placeOrder(
    await checkoutInput({ email: "pay@example.com", customerName: "Payer", phone: "+254700000002" }, "PICKUP"),
    null,
    { ip: "198.18.0.1", userAgent: "vitest" },
  );
  const step = await startPayment(order.id, "SANDBOX");
  const payment = await testDb.payment.findUniqueOrThrow({ where: { id: step.paymentId } });
  return { order, payment, variant, product, step };
}

function webhook(payment: { id: string; providerReference: string | null; amountCents: number; currency: string }, over: Record<string, unknown> = {}, secret = SECRET) {
  const body = JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: "payment.succeeded",
    data: { paymentId: payment.id, reference: payment.providerReference, amountCents: payment.amountCents, currency: payment.currency },
    ...over,
  });
  return { rawBody: body, headers: new Headers({ "x-sandbox-signature": signTimestampedPayload(secret, body) }) };
}

describe("payment initiation", () => {
  it("creates a payment and hands back a redirect, never marking anything paid", async () => {
    const { order, step } = await pendingOrder();
    expect(step.redirectUrl).toMatch(/^\/checkout\/sandbox\//);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });
});

describe("payment webhooks", () => {
  it("fulfils the order from a verified webhook and commits stock", async () => {
    const { order, payment, variant, product } = await pendingOrder(5, 2);
    const res = await processWebhook("SANDBOX", webhook(payment));
    expect(res.status).toBe(200);
    const paid = await testDb.order.findUniqueOrThrow({ where: { id: order.id }, include: { statusHistory: true } });
    expect(paid).toMatchObject({ status: "PAID", paymentStatus: "PAID" });
    expect(paid.statusHistory.map((h) => h.toStatus)).toEqual(["PENDING_PAYMENT", "PAID"]);
    expect(await testDb.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).toMatchObject({ quantity: 3, reserved: 0 });
    expect((await testDb.product.findUniqueOrThrow({ where: { id: product.id } })).salesCount).toBe(2);
    expect(await testDb.job.count({ where: { type: "email.orderConfirmation", payload: { path: ["orderId"], equals: order.id } } })).toBe(1);
  });

  it("rejects bad signatures without touching the order", async () => {
    const { order, payment } = await pendingOrder();
    const res = await processWebhook("SANDBOX", webhook(payment, {}, "wrong-secret-wrong-secret-wrong-secret"));
    expect(res.status).toBe(400);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("is idempotent for replayed events", async () => {
    const { payment, variant } = await pendingOrder();
    const hook = webhook(payment);
    expect((await processWebhook("SANDBOX", hook)).status).toBe(200);
    const replay = await processWebhook("SANDBOX", hook);
    expect(replay.body).toMatchObject({ duplicate: true });
    // a *different* event for an already-paid payment doesn't double-commit stock
    await processWebhook("SANDBOX", webhook(payment));
    expect((await testDb.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).quantity).toBe(4);
  });

  it("refuses to fulfil when the paid amount doesn't match", async () => {
    const { order, payment } = await pendingOrder();
    const res = await processWebhook("SANDBOX", webhook({ ...payment, amountCents: 1 }));
    expect(res.body).toMatchObject({ error: "rejected" });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect((await testDb.paymentEvent.findFirstOrThrow({ where: { payload: { path: ["data", "paymentId"], equals: payment.id } } })).error).toMatch(/Amount mismatch/);
  });

  it("records failures and keeps the order payable for recovery", async () => {
    const { order, payment } = await pendingOrder();
    await processWebhook("SANDBOX", webhook(payment, { type: "payment.failed" }));
    const o = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "FAILED" });
    const retry = await startPayment(order.id, "SANDBOX");
    expect(retry.paymentId).not.toBe(payment.id);
  });
});

describe("refunds", () => {
  it("refunds through the provider, updates statuses and restocks", async () => {
    const { order, payment, variant } = await pendingOrder(5, 1);
    await processWebhook("SANDBOX", webhook(payment));
    const admin = await createUser({ role: "ORDER_MANAGER" });
    await createSession(admin, { mfaVerified: true });
    const actor = await requirePermission("orders.refund");

    await expect(refundOrder({ orderId: order.id, amountCents: 999999, reason: "too much", restock: false }, actor)).rejects.toMatchObject({ code: "VALIDATION" });
    await refundOrder({ orderId: order.id, amountCents: 5000, reason: "partial", restock: false }, actor);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PARTIALLY_REFUNDED");
    await refundOrder({ orderId: order.id, amountCents: payment.amountCents - 5000, reason: "rest", restock: true }, actor);
    const o = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED" });
    expect((await testDb.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).quantity).toBe(5);
    expect(await testDb.auditLog.count({ where: { entityId: order.id, action: "order.refunded" } })).toBe(2);
  });
});
