/** Automatic campaign discounts (pure). */
export interface PromotionRule {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  sellerIds: string[];
  categoryIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

export interface PromoLine {
  unitPriceCents: number;
  quantity: number;
  sellerId: string;
  categoryId: string;
}

export interface LineDiscount {
  discountCents: number;
  promotionId: string | null;
  promotionName: string | null;
  /** Seller-scoped campaigns are funded by the seller; platform-wide ones by the platform. */
  sellerFunded: boolean;
}

function applies(p: PromotionRule, line: PromoLine, now: Date) {
  if (!p.isActive) return false;
  if (p.startsAt && p.startsAt > now) return false;
  if (p.endsAt && p.endsAt < now) return false;
  if (p.sellerIds.length && !p.sellerIds.includes(line.sellerId)) return false;
  if (p.categoryIds.length && !p.categoryIds.includes(line.categoryId)) return false;
  return true;
}

function unitDiscount(p: PromotionRule, unitPriceCents: number) {
  const d = p.type === "PERCENTAGE" ? Math.floor((unitPriceCents * Math.min(p.value, 90)) / 100) : p.value;
  return Math.max(0, Math.min(d, unitPriceCents));
}

/** Best single promotion per line (promotions don't stack). */
export function applyPromotions(lines: PromoLine[], promotions: PromotionRule[], now = new Date()): LineDiscount[] {
  return lines.map((line) => {
    let best: LineDiscount = { discountCents: 0, promotionId: null, promotionName: null, sellerFunded: false };
    for (const p of promotions) {
      if (!applies(p, line, now)) continue;
      const total = unitDiscount(p, line.unitPriceCents) * line.quantity;
      if (total > best.discountCents) best = { discountCents: total, promotionId: p.id, promotionName: p.name, sellerFunded: p.sellerIds.length > 0 };
    }
    return best;
  });
}
