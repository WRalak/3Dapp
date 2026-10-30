import { describe, expect, it } from "vitest";
import { allocateProportionally, resolveCommissionBps, settleSellerOrder, splitRefund } from "@/features/finance/settlement";
import { applyPromotions, type PromotionRule } from "@/features/orders/promotions";
import { computeMarketplaceTotals } from "@/features/orders/pricing";
import { deliveryOptionsFor, eatHour, etaLabel, type ZoneRule } from "@/features/delivery/availability";
import { parentStatusFrom } from "@/features/orders/state-machine";
import { KENYA_COUNTIES, countySlug } from "@/features/delivery/counties";
import { formatAddress } from "@/features/delivery/address";

describe("commission & settlement", () => {
  it("resolves seller override, then category, then platform default", () => {
    expect(resolveCommissionBps(800, 1500, 1200)).toBe(800);
    expect(resolveCommissionBps(null, 1500, 1200)).toBe(1500);
    expect(resolveCommissionBps(undefined, null, 1200)).toBe(1200);
    expect(resolveCommissionBps(0, 1500, 1200)).toBe(0); // explicit 0% is honoured
  });

  it("charges commission on merchandise after seller-funded discounts; delivery passes through", () => {
    expect(settleSellerOrder({ merchandiseCents: 650_000, sellerDiscountCents: 50_000, shippingCents: 30_000, rateBps: 1200 })).toEqual({ baseCents: 600_000, commissionCents: 72_000, sellerNetCents: 558_000 });
  });

  it("never charges more commission than the base", () => {
    expect(settleSellerOrder({ merchandiseCents: 100, sellerDiscountCents: 200, shippingCents: 0, rateBps: 5000 })).toEqual({ baseCents: 0, commissionCents: 0, sellerNetCents: 0 });
  });

  it("splits refunds proportionally and exactly", () => {
    const so = { totalCents: 335_000, commissionCents: 36_000 };
    const full = splitRefund(335_000, so);
    expect(full).toEqual({ commissionReversalCents: 36_000, sellerDebitCents: 299_000 });
    const part = splitRefund(100_000, so);
    expect(part.commissionReversalCents + part.sellerDebitCents).toBe(100_000);
  });

  it("allocates amounts with the largest-remainder method (sums exactly)", () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    expect(allocateProportionally(0, [5, 5])).toEqual([0, 0]);
  });
});

describe("promotions", () => {
  const now = new Date("2026-10-30T10:00:00Z");
  const promo = (over: Partial<PromotionRule>): PromotionRule => ({ id: "p", name: "P", type: "PERCENTAGE", value: 10, sellerIds: [], categoryIds: [], startsAt: null, endsAt: null, isActive: true, ...over });
  const line = { unitPriceCents: 500_000, quantity: 2, sellerId: "s1", categoryId: "ankara" };

  it("applies the best single promotion per line, never stacking", () => {
    const [d] = applyPromotions([line], [promo({ id: "a", value: 10 }), promo({ id: "b", value: 15, sellerIds: ["s1"] })], now);
    expect(d).toMatchObject({ discountCents: 150_000, promotionId: "b", sellerFunded: true });
  });

  it("respects scope, windows and activity", () => {
    const ds = applyPromotions(
      [line],
      [promo({ categoryIds: ["men"] }), promo({ sellerIds: ["other"] }), promo({ endsAt: new Date("2026-10-01") }), promo({ isActive: false }), promo({ startsAt: new Date("2026-11-01") })],
      now,
    );
    expect(ds[0]!.discountCents).toBe(0);
  });

  it("caps percentage at 90% and fixed at the unit price", () => {
    expect(applyPromotions([line], [promo({ value: 100 })], now)[0]!.discountCents).toBe(900_000);
    expect(applyPromotions([line], [promo({ type: "FIXED", value: 9_999_999 })], now)[0]!.discountCents).toBe(1_000_000);
  });
});

describe("marketplace totals", () => {
  it("applies promotions, then the coupon, then delivery; VAT inclusive", () => {
    const t = computeMarketplaceTotals({
      lines: [{ unitPriceCents: 500_000, quantity: 2 }],
      promotionDiscountCents: 100_000,
      coupon: { code: "SAVE500", type: "FIXED", value: 50_000, minSubtotalCents: 500_000, maxRedemptions: null, redemptionCount: 0, startsAt: null, endsAt: null, isActive: true },
      shippingCents: 65_000,
      taxRateBps: 1600,
      taxInclusive: true,
    });
    expect(t).toMatchObject({ subtotalCents: 1_000_000, promotionDiscountCents: 100_000, couponDiscountCents: 50_000, shippingCents: 65_000, totalCents: 915_000 });
    expect(t.taxCents).toBe(Math.round(850_000 - 850_000 / 1.16));
  });

  it("a free-delivery code waives every seller's fee", () => {
    const t = computeMarketplaceTotals({
      lines: [{ unitPriceCents: 600_000, quantity: 1 }],
      promotionDiscountCents: 0,
      coupon: { code: "FREESHIP", type: "FREE_SHIPPING", value: 0, minSubtotalCents: 500_000, maxRedemptions: null, redemptionCount: 0, startsAt: null, endsAt: null, isActive: true },
      shippingCents: 75_000,
      taxRateBps: 1600,
      taxInclusive: true,
    });
    expect(t).toMatchObject({ freeShipping: true, shippingCents: 0, totalCents: 600_000 });
  });
});

describe("delivery availability", () => {
  const zone = (over: Partial<ZoneRule> = {}): ZoneRule => ({
    id: "z",
    isActive: true,
    countyIds: ["nairobi"],
    towns: [],
    methods: [
      { id: "sd", type: "SAME_DAY", name: "Rider", priceCents: 30_000, freeOverCents: null, minDays: 0, maxDays: 0, cutoffHour: 14, pickupAddress: null, isActive: true },
      { id: "pu", type: "PICKUP", name: "Pickup", priceCents: 0, freeOverCents: null, minDays: 0, maxDays: 1, cutoffHour: null, pickupAddress: "Westlands", isActive: true },
      { id: "st", type: "STANDARD", name: "Standard", priceCents: 35_000, freeOverCents: 1_000_000, minDays: 1, maxDays: 3, cutoffHour: null, pickupAddress: null, isActive: true },
    ],
    ...over,
  });
  const morning = new Date("2026-10-30T06:00:00Z"); // 09:00 EAT
  const evening = new Date("2026-10-30T13:00:00Z"); // 16:00 EAT

  it("uses East Africa Time", () => {
    expect(eatHour(morning)).toBe(9);
    expect(eatHour(new Date("2026-10-30T22:30:00Z"))).toBe(1);
  });

  it("offers delivery only where a zone covers the county; pickup everywhere", () => {
    expect(deliveryOptionsFor([zone()], "nairobi", "Kilimani", 100_000, morning).map((o) => o.methodId)).toEqual(["pu", "sd", "st"]);
    expect(deliveryOptionsFor([zone()], "turkana", "Lodwar", 100_000, morning).map((o) => o.type)).toEqual(["PICKUP"]);
    expect(deliveryOptionsFor([zone()], null, null, 100_000, morning).map((o) => o.type)).toEqual(["PICKUP"]);
  });

  it("narrows zones to towns (case-insensitive)", () => {
    const z = zone({ towns: ["Westlands", "Kilimani"] });
    expect(deliveryOptionsFor([z], "nairobi", "kilimani ", 0, morning).some((o) => o.type === "SAME_DAY")).toBe(true);
    expect(deliveryOptionsFor([z], "nairobi", "Kasarani", 0, morning).some((o) => o.type === "SAME_DAY")).toBe(false);
  });

  it("rolls same-day to tomorrow after the cut-off, and applies free-over", () => {
    const late = deliveryOptionsFor([zone()], "nairobi", null, 1_200_000, evening);
    expect(late.find((o) => o.type === "SAME_DAY")).toMatchObject({ etaMinDays: 1, etaMaxDays: 1 });
    expect(late.find((o) => o.type === "STANDARD")!.priceCents).toBe(0);
    expect(etaLabel(0, 0)).toBe("Today");
    expect(etaLabel(1, 1)).toBe("Tomorrow");
    expect(etaLabel(2, 4)).toBe("2–4 days");
  });

  it("ignores inactive zones and methods", () => {
    expect(deliveryOptionsFor([zone({ isActive: false })], "nairobi", null, 0, morning)).toEqual([]);
  });
});

describe("split-order status", () => {
  it("is delivered only when every active seller has delivered", () => {
    expect(parentStatusFrom(["DELIVERED", "SHIPPED"])).toBe("SHIPPED");
    expect(parentStatusFrom(["DELIVERED", "DELIVERED"])).toBe("DELIVERED");
    expect(parentStatusFrom(["DELIVERED", "CANCELLED"])).toBe("DELIVERED");
    expect(parentStatusFrom(["PAID", "PROCESSING"])).toBe("PROCESSING");
    expect(parentStatusFrom(["PAID", "PAID"])).toBe("PAID");
    expect(parentStatusFrom(["REFUNDED", "REFUNDED"])).toBe("REFUNDED");
    expect(parentStatusFrom(["PENDING_PAYMENT"])).toBeNull();
  });
});

describe("Kenyan reference data", () => {
  it("has all 47 counties with unique codes and slugs", () => {
    expect(KENYA_COUNTIES).toHaveLength(47);
    expect(new Set(KENYA_COUNTIES.map((c) => c.code)).size).toBe(47);
    expect(new Set(KENYA_COUNTIES.map((c) => countySlug(c.name))).size).toBe(47);
    expect(countySlug("Taita-Taveta")).toBe("taita-taveta");
    expect(countySlug("Murang'a")).toBe("muranga");
  });

  it("formats Kenyan addresses from county down to building", () => {
    expect(formatAddress({ building: "Riverside Apts, 4B", estate: "Kilimani", town: "Nairobi", county: "Nairobi" })).toBe("Riverside Apts, 4B, Kilimani, Nairobi, Nairobi");
    expect(formatAddress({ line1: "1 Road", city: "Nairobi", region: "Nairobi", postalCode: "00100" })).toBe("1 Road, Nairobi, Nairobi, 00100");
  });
});
