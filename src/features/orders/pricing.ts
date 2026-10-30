import { SHIPPING_METHODS, type ShippingMethodId } from "@/config/site";

/** Pure pricing rules. All amounts are integer minor units. No I/O here — easy to test. */

export interface Priceable {
  priceCents: number;
  salePriceCents: number | null;
  saleEndsAt?: Date | string | null;
}

export interface VariantPriceable {
  priceCents: number | null;
  salePriceCents: number | null;
}

function saleActive(endsAt: Date | string | null | undefined, now: Date) {
  return !endsAt || new Date(endsAt) > now;
}

/** Effective unit price for a variant, honouring variant overrides and sale windows. */
export function unitPrice(product: Priceable, variant?: VariantPriceable | null, now = new Date()) {
  const regular = variant?.priceCents ?? product.priceCents;
  const sale = variant?.salePriceCents ?? product.salePriceCents;
  const onSale = sale != null && sale < regular && saleActive(product.saleEndsAt, now);
  return { priceCents: onSale ? sale! : regular, compareAtCents: onSale ? regular : null };
}

export interface CouponRule {
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minSubtotalCents: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

export function couponProblem(coupon: CouponRule, subtotalCents: number, now = new Date()): string | null {
  if (!coupon.isActive) return "This code is no longer active";
  if (coupon.startsAt && coupon.startsAt > now) return "This code is not active yet";
  if (coupon.endsAt && coupon.endsAt < now) return "This code has expired";
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) return "This code has been fully redeemed";
  if (subtotalCents < coupon.minSubtotalCents) return `Spend at least ${(coupon.minSubtotalCents / 100).toFixed(2)} to use this code`;
  return null;
}

export interface TotalsInput {
  lines: { unitPriceCents: number; quantity: number }[];
  shippingMethod: ShippingMethodId;
  coupon?: CouponRule | null;
  taxRateBps: number;
  taxInclusive: boolean;
  now?: Date;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  couponError: string | null;
  freeShippingRemainingCents: number | null;
}

export function shippingFor(method: ShippingMethodId, merchandiseCents: number) {
  const m = SHIPPING_METHODS.find((s) => s.id === method);
  if (!m) throw new Error(`Unknown shipping method ${method}`);
  if (m.freeOverCents != null && merchandiseCents >= m.freeOverCents) return { cents: 0, remaining: 0 };
  return { cents: m.priceCents, remaining: m.freeOverCents != null ? m.freeOverCents - merchandiseCents : null };
}

export function computeTotals(input: TotalsInput): Totals {
  const now = input.now ?? new Date();
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  let discountCents = 0;
  let freeShipping = false;
  let couponError: string | null = null;
  let couponCode: string | null = null;

  if (input.coupon) {
    couponError = couponProblem(input.coupon, subtotalCents, now);
    if (!couponError) {
      couponCode = input.coupon.code;
      if (input.coupon.type === "PERCENTAGE") discountCents = Math.floor((subtotalCents * Math.min(input.coupon.value, 100)) / 100);
      else if (input.coupon.type === "FIXED") discountCents = Math.min(input.coupon.value, subtotalCents);
      else freeShipping = true;
    }
  }

  const merchandise = subtotalCents - discountCents;
  const ship = shippingFor(input.shippingMethod, merchandise);
  const shippingCents = freeShipping || subtotalCents === 0 ? 0 : ship.cents;

  const rate = input.taxRateBps / 10_000;
  const taxCents = input.taxInclusive ? Math.round(merchandise - merchandise / (1 + rate)) : Math.round(merchandise * rate);
  const totalCents = merchandise + shippingCents + (input.taxInclusive ? 0 : taxCents);

  return {
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents,
    couponCode,
    couponError,
    freeShippingRemainingCents: freeShipping ? 0 : ship.remaining,
  };
}

/** Human-friendly order number: AT-YYMMDD-XXXXX (no ambiguous characters). */
export function generateOrderNumber(now = new Date(), rand: () => number = Math.random) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 5 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `AT-${d}-${suffix}`;
}
