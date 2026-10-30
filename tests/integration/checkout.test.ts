import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetBrowser } from "../support/request-mock";
import { checkoutInput, createProduct, createUser, ensureRoles, testDb, uid } from "../support/factories";
import { addToCart, applyCoupon, getCart, mergeGuestCart } from "@/server/services/cart.service";
import { cancelOrder, expireStaleOrders, placeOrder } from "@/server/services/order.service";
import { reserveStock } from "@/server/services/inventory.service";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guards";

beforeAll(ensureRoles);
beforeEach(() => resetBrowser(`192.0.2.${Math.floor(Math.random() * 250)}`));

const input = (over: Record<string, unknown> = {}) => checkoutInput(over);
const ctx = { ip: "192.0.2.1", userAgent: "vitest" };

const inventory = (variantId: string) => testDb.inventory.findUniqueOrThrow({ where: { variantId } });

describe("cart", () => {
  it("prices from the database and enforces available stock", async () => {
    const { variant } = await createProduct({ stock: 2, priceCents: 5000, salePriceCents: 4000 });
    const cart = await addToCart(variant.id, 2);
    expect(cart.subtotalCents).toBe(8000);
    expect(cart.lines[0]!.compareAtCents).toBe(5000);
    await expect(addToCart(variant.id, 1)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("validates coupons server-side", async () => {
    const { variant } = await createProduct({ priceCents: 10000 });
    await addToCart(variant.id, 1);
    const code = uid("C").toUpperCase();
    await testDb.coupon.create({ data: { code, type: "PERCENTAGE", value: 20 } });
    expect((await applyCoupon(code)).discountCents).toBe(2000);
    await expect(applyCoupon("NOT-A-CODE")).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("merges a guest cart into the account at sign-in", async () => {
    const { variant } = await createProduct();
    await addToCart(variant.id, 1);
    const user = await createUser();
    await createSession(user, {});
    await mergeGuestCart(user.id);
    expect((await getCart()).itemCount).toBe(1);
  });
});

describe("placing orders", () => {
  it("reserves stock, snapshots prices, clears the cart and is idempotent", async () => {
    const { variant } = await createProduct({ stock: 3, priceCents: 10000 });
    await addToCart(variant.id, 2);
    const data = await input();
    const order = await placeOrder(data, null, ctx);
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", subtotalCents: 20000, shippingCents: 35000, taxCents: 2759, totalCents: 55000 });
    expect(await inventory(variant.id)).toMatchObject({ quantity: 3, reserved: 2 });
    expect((await getCart()).lines).toHaveLength(0);
    const again = await placeOrder(data, null, ctx);
    expect(again.id).toBe(order.id);
    const history = await testDb.orderStatusHistory.findMany({ where: { orderId: order.id } });
    expect(history.map((h) => h.toStatus)).toEqual(["PENDING_PAYMENT"]);
  });

  it("cannot oversell: competing checkouts for the last unit", async () => {
    const { variant } = await createProduct({ stock: 1 });
    const { jar } = await import("../support/request-mock");
    const browsers: Map<string, string>[] = [];
    for (const n of [1, 2, 3]) {
      resetBrowser(`192.0.2.${100 + n}`);
      await addToCart(variant.id, 1);
      browsers.push(new Map(jar));
    }
    const results: string[] = [];
    for (const cookies of browsers) {
      jar.clear();
      cookies.forEach((v, k) => jar.set(k, v));
      results.push(await placeOrder(await input(), null, ctx).then(() => "ok").catch((e: { code: string }) => e.code));
    }
    expect(results).toEqual(["ok", "OUT_OF_STOCK", "OUT_OF_STOCK"]);
    expect(await inventory(variant.id)).toMatchObject({ quantity: 1, reserved: 1 });
  });

  it("reservations are atomic under true database concurrency", async () => {
    const { variant } = await createProduct({ stock: 2 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => testDb.$transaction((tx) => reserveStock(tx as never, variant.id, 1, `race-${randomUUID()}`, "race"))),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
    expect(await inventory(variant.id)).toMatchObject({ quantity: 2, reserved: 2 });
  });

  it("enforces per-customer coupon limits and redemption caps", async () => {
    const { variant } = await createProduct({ stock: 10 });
    const user = await createUser();
    await createSession(user, {});
    const me = await getCurrentUser();
    const code = uid("ONCE").toUpperCase();
    await testDb.coupon.create({ data: { code, type: "FIXED", value: 500, perUserLimit: 1 } });
    await addToCart(variant.id, 1);
    await applyCoupon(code);
    const first = await placeOrder(await input(), me, ctx);
    expect(first.discountCents).toBe(500);
    await addToCart(variant.id, 1);
    await expect(applyCoupon(code)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects saved addresses that belong to someone else", async () => {
    const other = await createUser();
    const addr = await testDb.address.create({ data: { userId: other.id, fullName: "X", phone: "+254700000000", line1: "x", city: "y", country: "KE", countyId: (await testDb.county.findFirstOrThrow()).id } });
    const { variant } = await createProduct();
    const user = await createUser();
    await createSession(user, {});
    await addToCart(variant.id, 1);
    await expect(placeOrder(await input({ address: undefined, savedAddressId: addr.id }), await getCurrentUser(), ctx)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("releases stock on cancellation and when reservations expire", async () => {
    const { variant } = await createProduct({ stock: 4 });
    await addToCart(variant.id, 1);
    const a = await placeOrder(await input(), null, ctx);
    await addToCart(variant.id, 2);
    const b = await placeOrder(await input(), null, ctx);
    expect((await inventory(variant.id)).reserved).toBe(3);

    await cancelOrder(a.id, "changed mind", null);
    expect((await inventory(variant.id)).reserved).toBe(2);

    await testDb.order.update({ where: { id: b.id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    await expireStaleOrders(async () => undefined);
    expect((await inventory(variant.id)).reserved).toBe(0);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("CANCELLED");
    const moves = await testDb.inventoryMovement.findMany({ where: { inventory: { variantId: variant.id } }, orderBy: { createdAt: "asc" } });
    expect(moves.map((m) => m.type)).toEqual(expect.arrayContaining(["RESERVATION", "RELEASE"]));
  });
});
