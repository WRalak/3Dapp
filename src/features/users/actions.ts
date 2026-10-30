"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { db } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { revokeUserSessions } from "@/lib/auth/session";
import { AppError, notFound, rateLimited } from "@/lib/errors";
import { limitBy } from "@/lib/security/rate-limit";
import { randomToken } from "@/lib/security/crypto";
import { addressSchema, newsletterSchema, notificationPrefsSchema, profileSchema, reviewSchema } from "@/lib/validation/account";
import { changePasswordSchema } from "@/lib/validation/auth";
import { changePassword } from "@/server/services/auth.service";
import { markAllRead, markRead } from "@/server/services/notification.service";
import { removeFromWishlist } from "@/server/services/wishlist.service";
import { addToCart } from "@/server/services/cart.service";
import { cancelOrder } from "@/server/services/order.service";
import { requestContext } from "@/lib/security/request";
import { invalidateCatalogCache } from "@/server/services/catalog.service";

const blank = (v?: string | null) => (v ? v : null);

export const updateProfileAction = action(profileSchema, async (input) => {
  const user = await requireUser();
  await db.user.update({
    where: { id: user.id },
    data: { name: input.name, image: blank(input.image), profile: { upsert: { update: { phone: blank(input.phone) }, create: { phone: blank(input.phone) } } } },
  });
  revalidatePath("/account", "layout");
  return { message: "Profile updated" };
});

export const changePasswordAction = action(changePasswordSchema, async (input) => {
  const user = await requireUser();
  await changePassword(user.id, user.sessionId, input.currentPassword, input.password);
  return { message: "Password changed. Other devices have been signed out." };
});

export const revokeSessionAction = action(z.object({ sessionId: z.string() }), async ({ sessionId }) => {
  const user = await requireUser();
  await db.session.updateMany({ where: { id: sessionId, userId: user.id }, data: { revokedAt: new Date() } });
  revalidatePath("/account/security");
  return { message: "Session signed out" };
});

export const revokeOtherSessionsAction = action(z.object({}), async () => {
  const user = await requireUser();
  await revokeUserSessions(user.id, user.sessionId);
  revalidatePath("/account/security");
  return { message: "All other sessions signed out" };
});

export const saveAddressAction = action(addressSchema.extend({ id: z.string().optional() }), async ({ id, ...input }) => {
  const user = await requireUser();
  const county = await db.county.findUnique({ where: { id: input.countyId } });
  if (!county) throw new AppError("VALIDATION", "Choose a valid county", { countyId: ["Choose a valid county"] });
  const data = {
    label: blank(input.label),
    fullName: input.fullName,
    phone: input.phone,
    countyId: county.id,
    town: input.town,
    estate: input.estate,
    building: blank(input.building),
    directions: blank(input.directions),
    // Legacy columns kept populated for older readers.
    line1: input.line1 || input.estate,
    city: input.town,
    region: county.name,
    country: "KE",
    isDefault: input.isDefault,
  };
  await db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId: user.id, deletedAt: null } });
    const makeDefault = data.isDefault || count === 0;
    if (makeDefault) await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
    if (id) {
      const owned = await tx.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
      if (!owned) throw notFound("Address");
      await tx.address.update({ where: { id }, data: { ...data, isDefault: makeDefault } });
    } else {
      if (count >= 20) throw new AppError("VALIDATION", "You can save up to 20 addresses");
      await tx.address.create({ data: { ...data, isDefault: makeDefault, userId: user.id } });
    }
  });
  revalidatePath("/account/addresses");
  return { message: "Address saved" };
});

export const deleteAddressAction = action(z.object({ id: z.string() }), async ({ id }) => {
  const user = await requireUser();
  const addr = await db.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!addr) throw notFound("Address");
  await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  if (addr.isDefault) {
    const next = await db.address.findFirst({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (next) await db.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  revalidatePath("/account/addresses");
  return { message: "Address removed" };
});

export const setDefaultAddressAction = action(z.object({ id: z.string() }), async ({ id }) => {
  const user = await requireUser();
  await db.$transaction(async (tx) => {
    const addr = await tx.address.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!addr) throw notFound("Address");
    await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { isDefault: true } });
  });
  revalidatePath("/account/addresses");
  return { message: "Default address updated" };
});

export const updateNotificationPrefsAction = action(notificationPrefsSchema, async (prefs) => {
  const user = await requireUser();
  await db.customerProfile.upsert({ where: { userId: user.id }, update: prefs, create: { userId: user.id, ...prefs } });
  revalidatePath("/account/notifications");
  return { message: "Preferences saved" };
});

export const markNotificationsReadAction = action(z.object({ id: z.string().optional() }), async ({ id }) => {
  const user = await requireUser();
  if (id) await markRead(user.id, id);
  else await markAllRead(user.id);
  revalidatePath("/account", "layout");
  return {};
});

export const removeWishlistItemAction = action(z.object({ productId: z.string() }), async ({ productId }) => {
  const user = await requireUser();
  await removeFromWishlist(user.id, productId);
  revalidatePath("/wishlist");
  return { message: "Removed from wishlist" };
});

export const moveWishlistToCartAction = action(z.object({ productId: z.string(), variantId: z.string() }), async ({ productId, variantId }) => {
  const user = await requireUser();
  const variant = await db.productVariant.findFirst({ where: { id: variantId, productId } });
  if (!variant) throw notFound("Variant");
  await addToCart(variantId, 1);
  await removeFromWishlist(user.id, productId);
  revalidatePath("/wishlist");
  return { message: "Moved to your bag" };
});

export const subscribeRestockAction = action(z.object({ variantId: z.string() }), async ({ variantId }) => {
  const user = await requireUser();
  await db.restockSubscription.upsert({ where: { userId_variantId: { userId: user.id, variantId } }, update: { notifiedAt: null }, create: { userId: user.id, variantId } });
  return { message: "We'll let you know when it's back" };
});

export const submitReviewAction = action(reviewSchema, async (input) => {
  const user = await requireUser();
  const rl = await limitBy("review", user.id);
  if (!rl.success) throw rateLimited();
  const purchased = await db.orderItem.count({ where: { productId: input.productId, order: { userId: user.id, paymentStatus: "PAID" } } });
  const existing = await db.review.findUnique({ where: { productId_userId: { productId: input.productId, userId: user.id } } });
  if (existing) throw new AppError("CONFLICT", "You've already reviewed this piece");
  await db.review.create({ data: { ...input, userId: user.id, verifiedPurchase: purchased > 0, status: "PENDING" } });
  await invalidateCatalogCache();
  return { message: "Thanks — your review will appear once approved." };
});

export const subscribeNewsletterAction = action(newsletterSchema, async ({ email }) => {
  const ctx = await requestContext();
  const rl = await limitBy("newsletter", ctx.ip);
  if (!rl.success) throw rateLimited();
  await db.newsletterSubscriber.upsert({
    where: { email },
    update: { status: "SUBSCRIBED" },
    create: { email, source: "footer", unsubscribeToken: randomToken(24) },
  });
  return { message: "You're on the list." };
});

export const cancelMyOrderAction = action(z.object({ orderId: z.string() }), async ({ orderId }) => {
  const user = await requireUser();
  const order = await db.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order) throw notFound("Order");
  await cancelOrder(orderId, "Cancelled by customer", null);
  revalidatePath(`/account/orders/${order.number}`);
  return { message: "Order cancelled" };
});
