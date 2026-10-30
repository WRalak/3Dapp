import { describe, expect, it } from "vitest";
import { computeTotals, couponProblem, generateOrderNumber, shippingFor, unitPrice, type CouponRule } from "@/features/orders/pricing";

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: "TEST",
  type: "PERCENTAGE",
  value: 10,
  minSubtotalCents: 0,
  maxRedemptions: null,
  redemptionCount: 0,
  startsAt: null,
  endsAt: null,
  isActive: true,
  ...over,
});

describe("unitPrice", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("uses the regular price when there is no sale", () => {
    expect(unitPrice({ priceCents: 10000, salePriceCents: null }, null, now)).toEqual({ priceCents: 10000, compareAtCents: null });
  });
  it("applies an active sale and reports the compare-at price", () => {
    expect(unitPrice({ priceCents: 10000, salePriceCents: 8000, saleEndsAt: "2026-07-01" }, null, now)).toEqual({ priceCents: 8000, compareAtCents: 10000 });
  });
  it("ignores an expired sale", () => {
    expect(unitPrice({ priceCents: 10000, salePriceCents: 8000, saleEndsAt: "2026-05-01" }, null, now).priceCents).toBe(10000);
  });
  it("ignores a 'sale' that is not cheaper", () => {
    expect(unitPrice({ priceCents: 10000, salePriceCents: 12000 }, null, now).priceCents).toBe(10000);
  });
  it("lets variant overrides win over product prices", () => {
    expect(unitPrice({ priceCents: 10000, salePriceCents: 8000 }, { priceCents: 15000, salePriceCents: null }, now)).toEqual({ priceCents: 8000, compareAtCents: 15000 });
    expect(unitPrice({ priceCents: 10000, salePriceCents: null }, { priceCents: 15000, salePriceCents: 14000 }, now)).toEqual({ priceCents: 14000, compareAtCents: 15000 });
  });
});

describe("computeTotals", () => {
  const base = { taxRateBps: 1600, taxInclusive: false } as const;

  it("sums lines, adds shipping and exclusive tax", () => {
    const t = computeTotals({ ...base, lines: [{ unitPriceCents: 5000, quantity: 2 }], shippingMethod: "standard" });
    expect(t).toMatchObject({ subtotalCents: 10000, discountCents: 0, shippingCents: 800, taxCents: 1600, totalCents: 12400 });
  });

  it("gives free standard shipping above the threshold", () => {
    const t = computeTotals({ ...base, lines: [{ unitPriceCents: 30000, quantity: 1 }], shippingMethod: "standard" });
    expect(t.shippingCents).toBe(0);
    expect(t.freeShippingRemainingCents).toBe(0);
  });

  it("reports how much more is needed for free shipping", () => {
    expect(computeTotals({ ...base, lines: [{ unitPriceCents: 20000, quantity: 1 }], shippingMethod: "standard" }).freeShippingRemainingCents).toBe(5000);
  });

  it("applies percentage, fixed and free-shipping coupons", () => {
    const lines = [{ unitPriceCents: 10000, quantity: 1 }];
    expect(computeTotals({ ...base, lines, shippingMethod: "express", coupon: coupon() }).discountCents).toBe(1000);
    expect(computeTotals({ ...base, lines, shippingMethod: "express", coupon: coupon({ type: "FIXED", value: 2500 }) }).discountCents).toBe(2500);
    const free = computeTotals({ ...base, lines, shippingMethod: "express", coupon: coupon({ type: "FREE_SHIPPING", value: 0 }) });
    expect(free.shippingCents).toBe(0);
    expect(free.couponCode).toBe("TEST");
  });

  it("never discounts below zero", () => {
    const t = computeTotals({ ...base, lines: [{ unitPriceCents: 1000, quantity: 1 }], shippingMethod: "pickup", coupon: coupon({ type: "FIXED", value: 999999 }) });
    expect(t.discountCents).toBe(1000);
    expect(t.totalCents).toBe(0);
  });

  it("taxes the discounted amount", () => {
    const t = computeTotals({ ...base, lines: [{ unitPriceCents: 10000, quantity: 1 }], shippingMethod: "pickup", coupon: coupon() });
    expect(t.taxCents).toBe(1440);
  });

  it("extracts tax from inclusive prices without changing the total", () => {
    const t = computeTotals({ taxRateBps: 1600, taxInclusive: true, lines: [{ unitPriceCents: 11600, quantity: 1 }], shippingMethod: "pickup" });
    expect(t.taxCents).toBe(1600);
    expect(t.totalCents).toBe(11600);
  });

  it("rejects coupons that are invalid and reports why", () => {
    const t = computeTotals({ ...base, lines: [{ unitPriceCents: 1000, quantity: 1 }], shippingMethod: "pickup", coupon: coupon({ minSubtotalCents: 5000 }) });
    expect(t.discountCents).toBe(0);
    expect(t.couponError).toMatch(/Spend at least/);
  });

  it("charges no shipping for an empty cart", () => {
    expect(computeTotals({ ...base, lines: [], shippingMethod: "express" }).totalCents).toBe(0);
  });
});

describe("couponProblem", () => {
  const now = new Date("2026-06-01");
  it.each([
    [{ isActive: false }, /no longer active/],
    [{ startsAt: new Date("2026-07-01") }, /not active yet/],
    [{ endsAt: new Date("2026-05-01") }, /expired/],
    [{ maxRedemptions: 5, redemptionCount: 5 }, /fully redeemed/],
  ])("%o", (over, msg) => {
    expect(couponProblem(coupon(over), 10000, now)).toMatch(msg);
  });
  it("accepts a valid coupon", () => expect(couponProblem(coupon(), 10000, now)).toBeNull());
});

describe("shipping & order numbers", () => {
  it("throws for unknown shipping methods", () => expect(() => shippingFor("teleport" as never, 0)).toThrow());
  it("generates readable, unambiguous order numbers", () => {
    const n = generateOrderNumber(new Date("2026-10-30T10:00:00Z"));
    expect(n).toMatch(/^AT-261030-[A-HJ-NP-Z2-9]{5}$/);
  });
});
