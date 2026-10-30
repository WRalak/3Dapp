import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetBrowser } from "../support/request-mock";
import { checkoutInput, createProduct, createSeller, createUser, ensureCounty, ensureRoles, testDb, uid } from "../support/factories";
import { addToCart, applyCoupon, getCart } from "@/server/services/cart.service";
import { fulfilPayment, placeOrder } from "@/server/services/order.service";
import { confirmC2b, refundOrder, startPayment, validateC2b } from "@/server/services/payment.service";
import { processPayout, reconcileWallets, releaseDueEarnings, requestPayout } from "@/server/services/finance.service";
import { updateSellerOrderStatus } from "@/server/services/fulfilment.service";
import { updateProduct } from "@/server/services/product-admin.service";
import { decideSeller } from "@/server/services/seller.service";
import { getProductCardsByIds } from "@/server/services/catalog.service";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guards";
import { requireSeller } from "@/lib/auth/seller-guard";
import { productInputSchema } from "@/lib/validation/admin";

beforeAll(ensureRoles);
beforeEach(() => resetBrowser(`198.51.100.${Math.floor(Math.random() * 250)}`));

const ctx = { ip: "198.51.100.1", userAgent: "vitest" };

async function signInAs(user: { id: string } & Record<string, unknown>) {
  resetBrowser(`198.51.100.${Math.floor(Math.random() * 250)}`);
  await createSession(user as never, { mfaVerified: true });
  return (await getCurrentUser())!;
}

/** Two sellers, one cart, one paid order. */
async function paidTwoSellerOrder(opts: { coupon?: string } = {}) {
  const a = await createSeller();
  const b = await createSeller({ commissionRateBps: 2000 });
  const pa = await createProduct({ sellerId: a.seller.id, priceCents: 300_000, stock: 5 });
  const pb = await createProduct({ sellerId: b.seller.id, priceCents: 150_000, stock: 5 });
  await addToCart(pa.variant.id, 1);
  await addToCart(pb.variant.id, 2);
  if (opts.coupon) await applyCoupon(opts.coupon);
  const order = await placeOrder(await checkoutInput(), null, ctx);
  const step = await startPayment(order.id, "SANDBOX");
  await fulfilPayment(step.paymentId, {});
  const sellerOrders = await testDb.sellerOrder.findMany({ where: { orderId: order.id }, orderBy: { subtotalCents: "desc" } });
  return { a, b, pa, pb, order, sellerOrders, paymentId: step.paymentId };
}

const ledgerSum = async (where: object) => (await testDb.platformTransaction.aggregate({ where, _sum: { amountCents: true } }))._sum.amountCents ?? 0;

describe("multi-seller checkout", () => {
  it("splits one payment into seller orders with commission and shipping per seller", async () => {
    const { a, b, order, sellerOrders } = await paidTwoSellerOrder();
    expect(order.subtotalCents).toBe(600_000);
    expect(order.shippingCents).toBe(70_000); // each seller charges its own delivery
    expect(order.totalCents).toBe(670_000);
    const [soA, soB] = sellerOrders;
    expect(soA).toMatchObject({ sellerId: a.seller.id, subtotalCents: 300_000, shippingCents: 35_000, commissionCents: 36_000, sellerNetCents: 299_000, status: "PAID" });
    expect(soB).toMatchObject({ sellerId: b.seller.id, subtotalCents: 300_000, commissionCents: 60_000, sellerNetCents: 275_000 }); // 20% override
  });

  it("posts a balanced ledger and credits pending earnings on payment", async () => {
    const { a, order } = await paidTwoSellerOrder();
    const cash = await ledgerSum({ orderId: order.id, account: "PLATFORM_CASH" });
    const sellers = await ledgerSum({ orderId: order.id, account: "SELLER_PENDING" });
    const revenue = await ledgerSum({ orderId: order.id, account: "PLATFORM_REVENUE" });
    expect(cash).toBe(order.totalCents);
    expect(sellers + revenue).toBe(cash);
    const wallet = await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } });
    expect(Number(wallet.pendingCents)).toBe(299_000);
    expect(await testDb.commission.count({ where: { sellerOrder: { orderId: order.id } } })).toBe(2);
  });

  it("is idempotent: a duplicate payment confirmation does not double-credit", async () => {
    const { a, paymentId } = await paidTwoSellerOrder();
    await fulfilPayment(paymentId, {});
    expect(Number((await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } })).pendingCents)).toBe(299_000);
  });

  it("absorbs platform coupons on the platform, not the seller", async () => {
    const code = uid("PLAT").toUpperCase();
    await testDb.coupon.create({ data: { code, type: "FIXED", value: 50_000 } });
    const { order, sellerOrders } = await paidTwoSellerOrder({ coupon: code });
    expect(order.discountCents).toBe(50_000);
    expect(sellerOrders[0]!.sellerNetCents).toBe(299_000); // unchanged
    expect(await ledgerSum({ orderId: order.id, type: "ADJUSTMENT", account: "PLATFORM_REVENUE" })).toBe(-50_000);
    const all = await ledgerSum({ orderId: order.id, account: { in: ["SELLER_PENDING", "PLATFORM_REVENUE"] } });
    expect(all).toBe(order.totalCents);
  });

  it("refuses checkout when a seller doesn't deliver to the county", async () => {
    const far = await ensureCounty("Turkana", 23);
    const { variant } = await createProduct();
    await addToCart(variant.id, 1);
    const input = await checkoutInput();
    const data = { ...input, address: { ...input.address!, countyId: far.id, town: "Lodwar" } };
    await expect(placeOrder(data, null, ctx)).rejects.toMatchObject({ code: "VALIDATION" });
    // ...but pickup is always offered.
    const cart = await getCart({ countyId: far.id, town: "Lodwar" });
    expect(cart.groups[0]!.deliveryOptions.map((o) => o.type)).toEqual(["PICKUP"]);
  });
});

describe("seller isolation", () => {
  it("a seller cannot edit another seller's product or fulfil their orders", async () => {
    const { a, pb, sellerOrders } = await paidTwoSellerOrder();
    await signInAs(a.owner);
    const sellerCtx = await requireSeller();
    const input = productInputSchema.parse({
      name: "Hijack",
      description: "Trying to edit someone else's listing",
      brandId: pb.brand.id,
      categoryId: pb.category.id,
      garmentKind: "DRESS",
      price: 1,
      variants: [{ sku: uid("X").toUpperCase(), size: "M", color: "Red", colorHex: "#ff0000", stock: 1, lowStockThreshold: 1 }],
    });
    await expect(updateProduct(pb.product.id, input, sellerCtx.user, { sellerId: sellerCtx.seller.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const soB = sellerOrders.find((s) => s.sellerId !== a.seller.id)!;
    await expect(updateSellerOrderStatus({ sellerOrderId: soB.id, status: "SHIPPED" }, sellerCtx.user, { sellerId: sellerCtx.seller.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("pending and suspended sellers cannot use seller tools", async () => {
    const { owner } = await createSeller({ status: "PENDING" });
    await signInAs(owner);
    await expect(requireSeller()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("storefront visibility", () => {
  it("hides unapproved listings and every product of a suspended seller", async () => {
    const { seller } = await createSeller();
    const p = await createProduct({ sellerId: seller.id });
    expect(await getProductCardsByIds([p.product.id])).toHaveLength(1);
    await testDb.product.update({ where: { id: p.product.id }, data: { approvalStatus: "PENDING_REVIEW" } });
    expect(await getProductCardsByIds([p.product.id])).toHaveLength(0);
    await expect(addToCart(p.variant.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await testDb.product.update({ where: { id: p.product.id }, data: { approvalStatus: "APPROVED" } });

    const admin = await signInAs(await createUser({ role: "ADMIN" }));
    await decideSeller(seller.id, "suspend", "Counterfeit complaints", admin);
    expect(await getProductCardsByIds([p.product.id])).toHaveLength(0);
    const history = await testDb.sellerVerification.findMany({ where: { sellerId: seller.id } });
    expect(history.map((h) => h.decision)).toContain("SUSPENDED");
  });
});

describe("earnings, payouts and refunds", () => {
  it("releases earnings after delivery + hold, then pays out through finance", async () => {
    const { a, sellerOrders } = await paidTwoSellerOrder();
    await signInAs(a.owner);
    const sellerCtx = await requireSeller();
    const soA = sellerOrders.find((s) => s.sellerId === a.seller.id)!;
    await updateSellerOrderStatus({ sellerOrderId: soA.id, status: "SHIPPED", carrier: "G4S", trackingNumber: "G4S123" }, sellerCtx.user, { sellerId: a.seller.id });
    await updateSellerOrderStatus({ sellerOrderId: soA.id, status: "DELIVERED" }, sellerCtx.user, { sellerId: a.seller.id });
    expect(await testDb.shipmentTracking.count({ where: { shipment: { sellerOrderId: soA.id } } })).toBeGreaterThanOrEqual(2);

    // Not yet: still inside the hold window.
    await releaseDueEarnings();
    expect(Number((await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } })).availableCents)).toBe(0);
    await testDb.sellerOrder.update({ where: { id: soA.id }, data: { deliveredAt: new Date(Date.now() - 30 * 86_400_000) } });
    await releaseDueEarnings();
    let wallet = await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } });
    expect(Number(wallet.availableCents)).toBe(299_000);
    expect(Number(wallet.pendingCents)).toBe(0);

    await testDb.sellerProfile.update({ where: { sellerId: a.seller.id }, data: { payoutMethod: "MPESA", payoutMpesaPhone: "+254712345678" } });
    await expect(requestPayout(sellerCtx, 400_000)).rejects.toMatchObject({ code: "VALIDATION" }); // overdraw
    const payout = await requestPayout(sellerCtx, 200_000);
    wallet = await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } });
    expect([Number(wallet.availableCents), Number(wallet.reservedCents)]).toEqual([99_000, 200_000]);

    const finance = await signInAs(await createUser({ role: "FINANCE_MANAGER" }));
    await expect(processPayout(payout.id, { action: "paid", reference: "QK12ABC345" }, finance)).rejects.toMatchObject({ code: "BAD_REQUEST" }); // KYC first
    await testDb.sellerDocument.create({ data: { sellerId: a.seller.id, type: "NATIONAL_ID", fileKey: `private/documents/${uid("id")}.pdf`, fileName: "id.pdf", contentType: "application/pdf", size: 10, status: "ACCEPTED" } });
    await expect(processPayout(payout.id, { action: "paid" }, finance)).rejects.toMatchObject({ code: "VALIDATION" }); // reference required
    await processPayout(payout.id, { action: "paid", reference: "QK12ABC345" }, finance);
    wallet = await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } });
    expect([Number(wallet.reservedCents), Number(wallet.paidOutCents)]).toEqual([0, 200_000]);
    const recon = (await reconcileWallets()).find((r) => r.sellerId === a.seller.id)!;
    expect(recon.ok).toBe(true);
    expect(await testDb.auditLog.count({ where: { entityId: payout.id, action: "payout.paid" } })).toBe(1);
  });

  it("splits a seller-order refund between seller and platform commission", async () => {
    const { a, order, sellerOrders } = await paidTwoSellerOrder();
    const soA = sellerOrders.find((s) => s.sellerId === a.seller.id)!;
    const admin = await signInAs(await createUser({ role: "ADMIN" }));
    await expect(refundOrder({ orderId: order.id, sellerOrderId: soA.id, amountCents: soA.totalCents + 1, reason: "too much", restock: false }, admin)).rejects.toMatchObject({ code: "VALIDATION" });
    await refundOrder({ orderId: order.id, sellerOrderId: soA.id, amountCents: soA.totalCents, reason: "Damaged", restock: true }, admin);
    const wallet = await testDb.sellerWallet.findUniqueOrThrow({ where: { sellerId: a.seller.id } });
    expect(Number(wallet.pendingCents)).toBe(0);
    const commission = await testDb.commission.findUniqueOrThrow({ where: { sellerOrderId: soA.id } });
    expect(commission).toMatchObject({ status: "REVERSED", reversedCents: 36_000 });
    expect((await testDb.sellerOrder.findUniqueOrThrow({ where: { id: soA.id } })).status).toBe("REFUNDED");
    expect((await reconcileWallets()).find((r) => r.sellerId === a.seller.id)!.ok).toBe(true);
  });
});

describe("M-Pesa C2B (Paybill)", () => {
  async function openOrder() {
    const { variant } = await createProduct({ priceCents: 150_050 });
    await addToCart(variant.id, 1);
    return placeOrder(await checkoutInput({}, "PICKUP"), null, ctx);
  }

  it("validates account number and amount, confirms once per receipt", async () => {
    const order = await openOrder();
    const kes = Math.ceil(order.totalCents / 100); // M-Pesa moves whole shillings
    expect(await validateC2b({ TransID: "X", TransAmount: kes, BillRefNumber: "MT-000000-AAAAA" })).toMatchObject({ ok: false, code: "C2B00012" });
    expect(await validateC2b({ TransID: "X", TransAmount: kes - 1, BillRefNumber: order.number })).toMatchObject({ ok: false, code: "C2B00013" });
    expect(await validateC2b({ TransID: "X", TransAmount: kes, BillRefNumber: order.number.toLowerCase() })).toMatchObject({ ok: true });

    const receipt = uid("QK").toUpperCase().slice(0, 12);
    expect(await confirmC2b({ TransID: receipt, TransAmount: String(kes), BillRefNumber: order.number, MSISDN: "254712345678" })).toMatchObject({ matched: true });
    expect(await confirmC2b({ TransID: receipt, TransAmount: String(kes), BillRefNumber: order.number })).toMatchObject({ duplicate: true });
    const paid = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("PAID");
    expect(await testDb.payment.count({ where: { orderId: order.id, status: "SUCCEEDED" } })).toBe(1);
  });

  it("keeps unmatched payments for reconciliation instead of fulfilling", async () => {
    const order = await openOrder();
    const receipt = uid("QL").toUpperCase().slice(0, 12);
    expect(await confirmC2b({ TransID: receipt, TransAmount: "10", BillRefNumber: order.number })).toMatchObject({ matched: false });
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect((await testDb.paymentTransaction.findFirstOrThrow({ where: { receipt } })).status).toBe("UNMATCHED");
  });
});
