import "server-only";
import { cookies } from "next/headers";
import { db, type Tx } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { getCurrentUser } from "@/lib/auth/guards";
import { computeMarketplaceTotals, unitPrice } from "@/features/orders/pricing";
import { applyPromotions } from "@/features/orders/promotions";
import { deliveryOptionsFor } from "@/features/delivery/availability";
import { garmentArtwork } from "@/lib/media";
import type { CartLine, CartSellerGroup, CartView } from "@/types/cart";
import type { GarmentKindName } from "@/types/catalog";

export const CART_COOKIE = "mtindo_cart";
const MAX_QTY = 20;

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            include: {
              brand: { select: { name: true } },
              images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
              seller: { select: { id: true, slug: true, businessName: true, town: true, status: true, deletedAt: true, county: { select: { name: true } } } },
            },
          },
        },
      },
    },
  },
};

async function guestTokenHash(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(CART_COOKIE)?.value;
  return raw ? sha256(raw) : null;
}

async function findCart() {
  const user = await getCurrentUser();
  if (user) return db.cart.findUnique({ where: { userId: user.id }, include: cartInclude });
  const hash = await guestTokenHash();
  return hash ? db.cart.findUnique({ where: { guestToken: hash }, include: cartInclude }) : null;
}

/** Only callable from Server Actions / Route Handlers (may set a cookie). */
async function findOrCreateCart() {
  const existing = await findCart();
  if (existing) return existing;
  const user = await getCurrentUser();
  if (user) return db.cart.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id }, include: cartInclude });
  const raw = randomToken(24);
  const jar = await cookies();
  jar.set(CART_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return db.cart.create({ data: { guestToken: sha256(raw) }, include: cartInclude });
}

type CartWithItems = NonNullable<Awaited<ReturnType<typeof findCart>>>;

/** Where the bag is going and which method the customer picked per seller. */
export interface DeliveryContext {
  countyId?: string | null;
  town?: string | null;
  /** sellerId → shippingMethodId */
  selections?: Record<string, string>;
}

/** Storefront visibility rule shared by cart, catalogue and checkout. */
export function isPurchasable(p: { status: string; deletedAt: Date | null; approvalStatus: string; seller: { status: string; deletedAt: Date | null } }) {
  return p.status === "PUBLISHED" && !p.deletedAt && p.approvalStatus === "APPROVED" && p.seller.status === "APPROVED" && !p.seller.deletedAt;
}

export async function activePromotions(now = new Date()) {
  return db.promotion.findMany({ where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }], AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }] } });
}

export async function buildCartView(cart: CartWithItems | null, delivery: DeliveryContext = {}): Promise<CartView> {
  const e = env();
  const issues: string[] = [];
  const now = new Date();
  const items = (cart?.items ?? []).filter((i) => !i.variant.deletedAt && i.variant.isActive && isPurchasable(i.variant.product));
  const promotions = items.length ? await activePromotions(now) : [];
  const discounts = applyPromotions(
    items.map((i) => ({ unitPriceCents: unitPrice(i.variant.product, i.variant, now).priceCents, quantity: i.quantity, sellerId: i.variant.product.sellerId, categoryId: i.variant.product.categoryId })),
    promotions,
    now,
  );
  const lines: CartLine[] = items.map((i, idx) => {
    const v = i.variant;
    const p = v.product;
    const price = unitPrice(p, v, now);
    const available = Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0));
    if (available < i.quantity) issues.push(available === 0 ? `${p.name} (${v.size}) is sold out` : `Only ${available} left of ${p.name} (${v.size})`);
    const d = discounts[idx]!;
    return {
      id: i.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand.name,
      sellerId: p.sellerId,
      categoryId: p.categoryId,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      sku: v.sku,
      image: p.images[0]?.url ?? garmentArtwork(p.garmentKind as GarmentKindName, v.colorHex),
      unitPriceCents: price.priceCents,
      compareAtCents: price.compareAtCents,
      quantity: i.quantity,
      available,
      lineTotalCents: price.priceCents * i.quantity,
      promotionDiscountCents: d.discountCents,
      promotionName: d.promotionName,
      promotionId: d.promotionId,
      sellerFunded: d.sellerFunded,
    };
  });

  // Group by seller and work out each seller's delivery options for the destination.
  const sellerIds = [...new Set(lines.map((l) => l.sellerId))];
  const zones = sellerIds.length
    ? await db.deliveryZone.findMany({ where: { sellerId: { in: sellerIds }, isActive: true }, include: { counties: { select: { countyId: true } }, methods: { where: { isActive: true } } } })
    : [];
  const sellerById = new Map(items.map((i) => [i.variant.product.sellerId, i.variant.product.seller]));
  const groups: CartSellerGroup[] = sellerIds.map((sellerId) => {
    const sellerLines = lines.filter((l) => l.sellerId === sellerId);
    const seller = sellerById.get(sellerId)!;
    const merchandiseCents = sellerLines.reduce((s, l) => s + l.lineTotalCents, 0);
    const promotionDiscountCents = sellerLines.reduce((s, l) => s + l.promotionDiscountCents, 0);
    const sellerFundedDiscountCents = sellerLines.reduce((s, l) => s + (l.sellerFunded ? l.promotionDiscountCents : 0), 0);
    const options = deliveryOptionsFor(
      zones.filter((z) => z.sellerId === sellerId).map((z) => ({ id: z.id, isActive: z.isActive, towns: z.towns, countyIds: z.counties.map((c) => c.countyId), methods: z.methods })),
      delivery.countyId ?? null,
      delivery.town ?? null,
      merchandiseCents - promotionDiscountCents,
      now,
    );
    const chosen = delivery.selections?.[sellerId];
    return {
      sellerId,
      sellerName: seller.businessName,
      sellerSlug: seller.slug,
      sellerTown: seller.town,
      sellerCounty: seller.county?.name ?? null,
      lines: sellerLines,
      merchandiseCents,
      promotionDiscountCents,
      sellerFundedDiscountCents,
      deliveryOptions: options,
      selected: options.find((o) => o.methodId === chosen) ?? null,
    };
  });

  const coupon = cart?.couponCode ? await db.coupon.findUnique({ where: { code: cart.couponCode } }) : null;
  const totals = computeMarketplaceTotals({
    lines: lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
    promotionDiscountCents: lines.reduce((s, l) => s + l.promotionDiscountCents, 0),
    coupon,
    shippingCents: groups.reduce((s, g) => s + (g.selected?.priceCents ?? 0), 0),
    taxRateBps: e.TAX_RATE_BPS,
    taxInclusive: e.TAX_INCLUSIVE,
    now,
  });
  return {
    id: cart?.id ?? null,
    lines,
    groups,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    currency: e.STORE_CURRENCY,
    couponCode: cart?.couponCode ?? null,
    couponError: cart?.couponCode && !coupon ? "This code is not valid" : totals.couponError,
    subtotalCents: totals.subtotalCents,
    promotionDiscountCents: totals.promotionDiscountCents,
    couponDiscountCents: totals.couponDiscountCents,
    discountCents: totals.discountCents,
    shippingCents: totals.shippingCents,
    deliveryComplete: groups.length > 0 && groups.every((g) => g.selected),
    freeShipping: totals.freeShipping,
    taxCents: totals.taxCents,
    taxInclusive: e.TAX_INCLUSIVE,
    totalCents: totals.totalCents,
    issues,
  };
}

export async function getCart(delivery?: DeliveryContext) {
  return buildCartView(await findCart(), delivery);
}

export async function getRawCart() {
  return findCart();
}

async function availableFor(variantId: string, client: Tx | typeof db = db) {
  const v = await client.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true, product: { include: { seller: { select: { status: true, deletedAt: true } } } } } });
  if (!v || v.deletedAt || !v.isActive || !isPurchasable(v.product)) throw notFound("Product");
  return Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0));
}

export async function addToCart(variantId: string, quantity: number) {
  const cart = await findOrCreateCart();
  const available = await availableFor(variantId);
  const existing = cart.items.find((i) => i.variantId === variantId);
  const desired = Math.min(MAX_QTY, (existing?.quantity ?? 0) + quantity);
  if (available === 0) throw new AppError("OUT_OF_STOCK", "This size is sold out");
  if (desired > available) throw new AppError("OUT_OF_STOCK", `Only ${available} available`);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { quantity: desired },
    create: { cartId: cart.id, variantId, quantity: desired },
  });
  return getCart();
}

export async function updateCartItem(itemId: string, quantity: number) {
  const cart = await findCart();
  const item = cart?.items.find((i) => i.id === itemId);
  if (!cart || !item) throw notFound("Cart item");
  if (quantity === 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    const available = await availableFor(item.variantId);
    if (quantity > available) throw new AppError("OUT_OF_STOCK", `Only ${available} available`);
    await db.cartItem.update({ where: { id: itemId }, data: { quantity: Math.min(quantity, MAX_QTY) } });
  }
  return getCart();
}

export async function applyCoupon(code: string) {
  const cart = await findOrCreateCart();
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) throw new AppError("VALIDATION", "This code is not valid", { code: ["This code is not valid"] });
  const view = await buildCartView({ ...cart, couponCode: code });
  if (view.couponError) throw new AppError("VALIDATION", view.couponError, { code: [view.couponError] });
  const user = await getCurrentUser();
  if (coupon.perUserLimit && user) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: user.id } });
    if (used >= coupon.perUserLimit) throw new AppError("VALIDATION", "You've already used this code", { code: ["You've already used this code"] });
  }
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
  return getCart();
}

export async function removeCoupon() {
  const cart = await findCart();
  if (cart) await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  return getCart();
}

/** Called right after sign-in: folds the guest cart into the user's cart. */
export async function mergeGuestCart(userId: string) {
  const hash = await guestTokenHash();
  if (!hash) return;
  const guest = await db.cart.findUnique({ where: { guestToken: hash }, include: { items: true } });
  if (!guest) return;
  await db.$transaction(async (tx) => {
    const target = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } } });
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        update: { quantity: Math.min(MAX_QTY, (existing?.quantity ?? 0) + item.quantity) },
        create: { cartId: target.id, variantId: item.variantId, quantity: item.quantity },
      });
    }
    if (guest.couponCode && !target.couponCode) await tx.cart.update({ where: { id: target.id }, data: { couponCode: guest.couponCode } });
    await tx.cart.delete({ where: { id: guest.id } });
  });
  (await cookies()).delete(CART_COOKIE);
}

export async function clearCart(cartId: string, tx: Tx) {
  await tx.cartItem.deleteMany({ where: { cartId } });
  await tx.cart.update({ where: { id: cartId }, data: { couponCode: null } });
}

export function assertQuantity(q: number) {
  if (!Number.isInteger(q) || q < 0 || q > MAX_QTY) throw badRequest("Invalid quantity");
}
