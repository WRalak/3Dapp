"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import { requireSeller, requireSellerApplicant } from "@/lib/auth/seller-guard";
import { rateLimited } from "@/lib/errors";
import { limitBy } from "@/lib/security/rate-limit";
import { productInputSchema } from "@/lib/validation/admin";
import {
  deliveryZoneSchema,
  inquiryReplySchema,
  inquirySchema,
  payoutDetailsSchema,
  payoutRequestSchema,
  phoneCodeSchema,
  phoneVerifySchema,
  promotionSchema,
  reportSchema,
  sellerApplicationSchema,
  shippingMethodSchema,
  storeProfileSchema,
} from "@/lib/validation/marketplace";
import {
  addSellerDocument,
  applyAsSeller,
  decideSeller,
  followSeller,
  removeSellerDocument,
  reviewDocument,
  setSellerCommission,
  setSellerFeatured,
  updatePayoutDetails,
  updateStoreProfile,
} from "@/server/services/seller.service";
import { createProduct, deleteProduct, reviewProduct, setProductStatus, updateProduct } from "@/server/services/product-admin.service";
import { completeImageUpload, createUpload, deleteProductImage } from "@/server/services/asset.service";
import { adjustStock } from "@/server/services/inventory.service";
import { deleteMethod, deleteZone, saveMethod, saveZone } from "@/server/services/delivery.service";
import { updateSellerOrderStatus } from "@/server/services/fulfilment.service";
import { cancelPayout, processPayout, requestPayout } from "@/server/services/finance.service";
import { closeInquiry, confirmPhoneVerification, createInquiry, replyToInquiry, reportProduct, resolveReport, startPhoneVerification } from "@/server/services/community.service";
import { registerC2bUrls } from "@/features/payments/providers/mpesa-c2b";
import { audit } from "@/server/services/audit.service";
import { db } from "@/lib/db/prisma";
import { slugify } from "@/lib/utils";

const id = z.object({ id: z.string().min(1) });

// ── Customers ────────────────────────────────────────────────

export const followSellerAction = action(z.object({ sellerId: z.string().min(1), follow: z.boolean() }), async ({ sellerId, follow }) => {
  const user = await requireUser();
  await followSeller(user.id, sellerId, follow);
  revalidatePath("/designers");
  return { following: follow };
});

export const sendInquiryAction = action(inquirySchema, async (input) => {
  const user = await requireUser();
  const inquiry = await createInquiry(user, input);
  return { id: inquiry.id, message: "Message sent — the designer will reply here and by notification" };
});

export const replyInquiryAction = action(inquiryReplySchema, async (input) => {
  const user = await requireUser();
  await replyToInquiry(user, input);
  revalidatePath(`/account/messages/${input.inquiryId}`);
  revalidatePath(`/seller/inquiries/${input.inquiryId}`);
  return { message: "Reply sent" };
});

export const reportProductAction = action(reportSchema, async (input) => {
  const user = await requireUser();
  await reportProduct(user, input);
  return { message: "Thanks — our team will review this listing" };
});

export const startPhoneVerificationAction = action(phoneVerifySchema, async ({ phone }) => {
  const user = await requireUser();
  const { sentTo } = await startPhoneVerification(user, phone);
  return { message: `We sent a 6-digit code to ${sentTo}` };
});

export const confirmPhoneAction = action(phoneCodeSchema, async ({ code }) => {
  const user = await requireUser();
  await confirmPhoneVerification(user, code);
  revalidatePath("/account");
  return { message: "Phone number verified" };
});

// ── Seller onboarding ────────────────────────────────────────

export const applyAsSellerAction = action(sellerApplicationSchema, async (input) => {
  const user = await requireUser();
  if (!(await limitBy("sellerApply", user.id)).success) throw rateLimited();
  await applyAsSeller(user, input);
  revalidatePath("/sell/status");
  return { message: "Application submitted" };
});

const uploadRequest = z.object({ kind: z.enum(["document", "image"]), fileName: z.string().min(1).max(200), contentType: z.string().max(100), size: z.number().int().positive() });

/** Signed upload URLs for sellers: verification documents (private) and product/store images. */
export const sellerUploadAction = action(uploadRequest, async (input) => {
  const ctx = input.kind === "document" ? await requireSellerApplicant() : await requireSeller();
  if (!(await limitBy("upload", ctx.user.id)).success) throw rateLimited();
  return createUpload(input, ctx.user);
});

/** Attaches an uploaded photo to one of the seller's OWN products (ownership checked first). */
export const sellerCompleteImageAction = action(
  z.object({ claim: z.string().min(1), productId: z.string().min(1), alt: z.string().trim().min(2).max(160), kind: z.enum(["GALLERY", "FRONT", "BACK", "SIDE", "FABRIC_DETAIL"]).default("GALLERY") }),
  async (input) => {
    const ctx = await requireSeller();
    const owned = await db.product.findFirst({ where: { id: input.productId, sellerId: ctx.seller.id, deletedAt: null }, select: { id: true } });
    if (!owned) throw new (await import("@/lib/errors")).AppError("NOT_FOUND", "Product not found");
    await completeImageUpload(input, ctx.user);
    revalidatePath(`/seller/products/${input.productId}`);
    return { message: "Photo added" };
  },
);

export const sellerDeleteImageAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  const img = await db.productImage.findFirst({ where: { id, product: { sellerId: ctx.seller.id } }, select: { id: true, productId: true } });
  if (!img) throw new (await import("@/lib/errors")).AppError("NOT_FOUND", "Photo not found");
  await deleteProductImage(img.id, ctx.user);
  revalidatePath(`/seller/products/${img.productId}`);
  return { message: "Photo removed" };
});

export const addSellerDocumentAction = action(z.object({ claim: z.string().min(1), type: z.enum(["BUSINESS_REGISTRATION", "KRA_PIN", "NATIONAL_ID", "OTHER"]) }), async (input) => {
  const ctx = await requireSellerApplicant();
  await addSellerDocument(ctx, input);
  revalidatePath("/sell/status");
  return { message: "Document uploaded" };
});

export const removeSellerDocumentAction = action(id, async ({ id }) => {
  const ctx = await requireSellerApplicant();
  await removeSellerDocument(ctx, id);
  revalidatePath("/sell/status");
  return { message: "Document removed" };
});

// ── Seller portal ────────────────────────────────────────────

export const updateStoreProfileAction = action(storeProfileSchema, async (input) => {
  const ctx = await requireSeller();
  await updateStoreProfile(ctx, input);
  revalidatePath("/seller/profile");
  revalidatePath(`/designers/${ctx.seller.slug}`);
  return { message: "Store profile saved" };
});

export const updatePayoutDetailsAction = action(payoutDetailsSchema, async (input) => {
  const ctx = await requireSeller();
  await updatePayoutDetails(ctx, input);
  revalidatePath("/seller/earnings");
  return { message: "Payout details saved" };
});

export const sellerSaveProductAction = action(productInputSchema.and(z.object({ id: z.string().optional() })), async (input) => {
  const ctx = await requireSeller();
  const scope = { sellerId: ctx.seller.id };
  if (input.id) {
    await updateProduct(input.id, input, ctx.user, scope);
    revalidatePath(`/seller/products/${input.id}`);
    revalidatePath("/seller/products");
    return { id: input.id, message: "Product saved" };
  }
  const p = await createProduct(input, ctx.user, scope);
  revalidatePath("/seller/products");
  return { id: p.id, message: "Product submitted for review" };
});

export const sellerProductStatusAction = action(id.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }) => {
  const ctx = await requireSeller();
  await setProductStatus(id, status, ctx.user, { sellerId: ctx.seller.id });
  revalidatePath("/seller/products");
  return { message: status === "PUBLISHED" ? "Published (visible once approved)" : `Product ${status.toLowerCase()}` };
});

export const sellerDeleteProductAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  await deleteProduct(id, ctx.user, { sellerId: ctx.seller.id });
  revalidatePath("/seller/products");
  return { message: "Product deleted" };
});

export const sellerAdjustStockAction = action(
  z.object({ variantId: z.string().min(1), type: z.enum(["RESTOCK", "ADJUSTMENT", "RETURN"]), quantity: z.coerce.number().int().min(-10_000).max(10_000), reason: z.string().trim().min(2).max(200) }),
  async (input) => {
    const ctx = await requireSeller();
    const owned = await db.productVariant.findFirst({ where: { id: input.variantId, product: { sellerId: ctx.seller.id } }, select: { id: true } });
    if (!owned) throw new (await import("@/lib/errors")).AppError("NOT_FOUND", "Variant not found");
    await adjustStock(input, ctx.user.id);
    revalidatePath("/seller/inventory");
    return { message: "Stock updated" };
  },
);

export const sellerBrandAction = action(z.object({ name: z.string().trim().min(2).max(60) }), async ({ name }) => {
  const ctx = await requireSeller();
  const slug = `${slugify(name)}-${ctx.seller.slug}`.slice(0, 80);
  const brand = await db.brand.upsert({ where: { slug }, update: {}, create: { name, slug, sellerId: ctx.seller.id } });
  await audit(ctx.user.id, "brand.created", "Brand", brand.id, { sellerId: ctx.seller.id });
  return { id: brand.id, message: "Label added" };
});

export const sellerFulfilAction = action(
  z.object({
    sellerOrderId: z.string().min(1),
    status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]),
    carrier: z.string().trim().max(60).optional().or(z.literal("")),
    trackingNumber: z.string().trim().max(80).optional().or(z.literal("")),
    trackingUrl: z.string().trim().max(500).optional().or(z.literal("")),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  }),
  async (input) => {
    const ctx = await requireSeller();
    await updateSellerOrderStatus({ ...input, note: input.note || undefined, carrier: input.carrier || undefined, trackingNumber: input.trackingNumber || undefined, trackingUrl: input.trackingUrl || undefined }, ctx.user, { sellerId: ctx.seller.id });
    revalidatePath(`/seller/orders/${input.sellerOrderId}`);
    revalidatePath("/seller/orders");
    return { message: "Order updated — the customer has been notified" };
  },
);

export const saveZoneAction = action(deliveryZoneSchema, async (input) => {
  const ctx = await requireSeller();
  await saveZone(ctx, input);
  revalidatePath("/seller/delivery");
  return { message: "Delivery zone saved" };
});

export const deleteZoneAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  await deleteZone(ctx, id);
  revalidatePath("/seller/delivery");
  return { message: "Zone deleted" };
});

export const saveMethodAction = action(shippingMethodSchema, async (input) => {
  const ctx = await requireSeller();
  await saveMethod(ctx, input);
  revalidatePath("/seller/delivery");
  return { message: "Delivery option saved" };
});

export const deleteMethodAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  await deleteMethod(ctx, id);
  revalidatePath("/seller/delivery");
  return { message: "Delivery option removed" };
});

export const requestPayoutAction = action(payoutRequestSchema, async ({ amount }) => {
  const ctx = await requireSeller();
  await requestPayout(ctx, Math.round(amount * 100));
  revalidatePath("/seller/earnings");
  return { message: "Payout requested — finance processes payouts within 2 business days" };
});

export const cancelPayoutAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  await cancelPayout(ctx, id);
  revalidatePath("/seller/earnings");
  return { message: "Payout cancelled" };
});

export const closeInquiryAction = action(id, async ({ id }) => {
  const ctx = await requireSeller();
  await closeInquiry(ctx, id);
  revalidatePath("/seller/inquiries");
  return { message: "Conversation closed" };
});

// ── Admin: sellers, moderation, finance ──────────────────────

export const decideSellerAction = action(
  id.extend({ decision: z.enum(["approve", "reject", "requestChanges", "suspend", "reactivate"]), notes: z.string().trim().max(1000).optional().or(z.literal("")) }),
  async ({ id, decision, notes }) => {
    const user = await requirePermission("sellers.manage");
    await decideSeller(id, decision, notes || null, user);
    revalidatePath("/admin/sellers");
    revalidatePath(`/admin/sellers/${id}`);
    return { message: "Decision recorded" };
  },
);

export const reviewDocumentAction = action(id.extend({ status: z.enum(["ACCEPTED", "REJECTED"]), note: z.string().trim().max(300).optional().or(z.literal("")) }), async ({ id, status, note }) => {
  const user = await requirePermission("sellers.manage");
  const doc = await reviewDocument(id, status, note || null, user);
  revalidatePath(`/admin/sellers/${doc.sellerId}`);
  return { message: `Document ${status.toLowerCase()}` };
});

export const setCommissionAction = action(id.extend({ percent: z.union([z.literal(""), z.coerce.number().min(0).max(50)]) }), async ({ id, percent }) => {
  const user = await requirePermission("sellers.commission");
  await setSellerCommission(id, percent === "" ? null : Math.round(percent * 100), user);
  revalidatePath(`/admin/sellers/${id}`);
  return { message: "Commission updated" };
});

export const setSellerFeaturedAction = action(id.extend({ isFeatured: z.boolean() }), async ({ id, isFeatured }) => {
  const user = await requirePermission("sellers.manage");
  await setSellerFeatured(id, isFeatured, user);
  revalidatePath(`/admin/sellers/${id}`);
  return { message: isFeatured ? "Designer featured" : "Removed from featured" };
});

export const reviewProductAction = action(id.extend({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(500).optional().or(z.literal("")) }), async ({ id, decision, reason }) => {
  const user = await requirePermission("products.approve");
  await reviewProduct(id, decision, reason || null, user);
  revalidatePath("/admin/approvals");
  return { message: decision === "APPROVED" ? "Listing approved" : "Listing rejected" };
});

export const resolveReportAction = action(
  id.extend({ status: z.enum(["RESOLVED", "DISMISSED"]), resolution: z.string().trim().min(3).max(500), hideProduct: z.boolean().default(false) }),
  async ({ id, ...input }) => {
    const user = await requirePermission("reports.manage");
    await resolveReport(id, input, user);
    revalidatePath("/admin/reports");
    return { message: "Report closed" };
  },
);

export const processPayoutAction = action(
  id.extend({ action: z.enum(["paid", "failed", "initiate"]), reference: z.string().trim().max(60).optional().or(z.literal("")), reason: z.string().trim().max(300).optional().or(z.literal("")) }),
  async ({ id, ...input }) => {
    const user = await requirePermission("finance.payouts");
    await processPayout(id, { action: input.action, reference: input.reference || undefined, reason: input.reason || undefined }, user);
    revalidatePath("/admin/finance/payouts");
    return { message: input.action === "paid" ? "Payout marked as paid" : input.action === "failed" ? "Payout marked as failed — funds returned" : "M-Pesa payout initiated" };
  },
);

export const registerC2bAction = action(z.object({}), async () => {
  const user = await requirePermission("settings.manage");
  const res = await registerC2bUrls();
  await audit(user.id, "payments.c2b_registered", "Settings", null);
  return { message: res };
});

export const savePromotionAction = action(promotionSchema, async (input) => {
  const user = await requirePermission("promotions.manage");
  const data = {
    name: input.name,
    description: input.description || null,
    imageUrl: input.imageUrl || null,
    type: input.type,
    value: input.type === "FIXED" ? Math.round(input.value * 100) : Math.min(90, Math.round(input.value)),
    sellerIds: input.sellerIds,
    categoryIds: input.categoryIds,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    isActive: input.isActive,
  };
  const promo = input.id
    ? await db.promotion.update({ where: { id: input.id }, data })
    : await db.promotion.create({ data: { ...data, slug: `${slugify(input.name)}-${Date.now().toString(36)}` } });
  await audit(user.id, input.id ? "promotion.updated" : "promotion.created", "Promotion", promo.id, data);
  revalidatePath("/admin/promotions");
  return { message: "Promotion saved" };
});
