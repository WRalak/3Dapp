import "server-only";
import { cookies } from "next/headers";
import { db, type Tx } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { getCurrentUser } from "@/lib/auth/guards";
import { computeTotals, unitPrice } from "@/features/orders/pricing";
import { garmentArtwork } from "@/lib/media";
import type { ShippingMethodId } from "@/config/site";
import type { CartLine, CartView } from "@/types/cart";
import type { GarmentKindName } from "@/types/catalog";

export const CART_COOKIE = "atelier_cart";
const MAX_QTY = 20;

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            include: { brand: { select: { name: true } }, images: { orderBy: { sortOrder: "asc" as const }, take: 1 } },
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

export async function buildCartView(cart: CartWithItems | null, shippingMethod: ShippingMethodId = "standard"): Promise<CartView> {
  const e = env();
  const issues: string[] = [];
  const lines: CartLine[] = (cart?.items ?? [])
    .filter((i) => !i.variant.deletedAt && i.variant.isActive && i.variant.product.status === "PUBLISHED" && !i.variant.product.deletedAt)
    .map((i) => {
      const v = i.variant;
      const p = v.product;
      const price = unitPrice(p, v);
      const available = Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0));
      if (available < i.quantity) issues.push(available === 0 ? `${p.name} (${v.size}) is sold out` : `Only ${available} left of ${p.name} (${v.size})`);
      return {
        id: i.id,
        variantId: v.id,
        productId: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand.name,
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
      };
    });
  const coupon = cart?.couponCode ? await db.coupon.findUnique({ where: { code: cart.couponCode } }) : null;
  const totals = computeTotals({
    lines: lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
    shippingMethod,
    coupon,
    taxRateBps: e.TAX_RATE_BPS,
    taxInclusive: e.TAX_INCLUSIVE,
  });
  return {
    id: cart?.id ?? null,
    lines,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    currency: e.STORE_CURRENCY,
    couponCode: cart?.couponCode ?? null,
    couponError: cart?.couponCode && !coupon ? "This code is not valid" : totals.couponError,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    taxInclusive: e.TAX_INCLUSIVE,
    totalCents: totals.totalCents,
    freeShippingRemainingCents: totals.freeShippingRemainingCents,
    issues,
  };
}

export async function getCart(shippingMethod?: ShippingMethodId) {
  return buildCartView(await findCart(), shippingMethod);
}

export async function getRawCart() {
  return findCart();
}

async function availableFor(variantId: string, client: Tx | typeof db = db) {
  const v = await client.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true, product: true } });
  if (!v || v.deletedAt || !v.isActive || v.product.status !== "PUBLISHED" || v.product.deletedAt) throw notFound("Product");
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
