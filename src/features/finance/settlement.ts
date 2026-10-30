/**
 * Pure marketplace money rules (integer KES cents, no I/O).
 *
 * Commission is charged on the seller's merchandise after seller-funded discounts; delivery
 * fees pass through to the seller (they arrange delivery). Platform-funded discounts (coupons,
 * platform-wide promotions) are absorbed by the platform, so sellers are paid as if undiscounted.
 */

export function resolveCommissionBps(seller: number | null | undefined, category: number | null | undefined, platformDefault: number) {
  if (seller != null) return seller;
  if (category != null) return category;
  return platformDefault;
}

export interface SettlementInput {
  merchandiseCents: number;
  sellerDiscountCents: number;
  shippingCents: number;
  rateBps: number;
}

export function settleSellerOrder({ merchandiseCents, sellerDiscountCents, shippingCents, rateBps }: SettlementInput) {
  const base = Math.max(0, merchandiseCents - sellerDiscountCents);
  // Round half up to the nearest cent; commission never exceeds the base.
  const commissionCents = Math.min(base, Math.round((base * rateBps) / 10_000));
  return { baseCents: base, commissionCents, sellerNetCents: base - commissionCents + shippingCents };
}

/**
 * Splits a refund on one seller order between the seller and the platform in proportion to
 * how the original amount was shared (commission vs seller net).
 */
export function splitRefund(refundCents: number, sellerOrder: { totalCents: number; commissionCents: number }) {
  if (sellerOrder.totalCents <= 0) return { commissionReversalCents: 0, sellerDebitCents: refundCents };
  const commissionReversalCents = Math.min(sellerOrder.commissionCents, Math.round((refundCents * sellerOrder.commissionCents) / sellerOrder.totalCents));
  return { commissionReversalCents, sellerDebitCents: refundCents - commissionReversalCents };
}

/** Allocates a platform-funded discount across seller orders in proportion to their merchandise. */
export function allocateProportionally(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalCents <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const floored = raw.map(Math.floor);
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);
  // Largest-remainder method keeps the allocation exact.
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i]! += 1;
    remainder--;
  }
  return floored;
}
