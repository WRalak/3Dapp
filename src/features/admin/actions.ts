"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { requirePermission } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import {
  brandInputSchema,
  cancelOrderSchema,
  categoryInputSchema,
  collectionInputSchema,
  contentBlockSchema,
  couponInputSchema,
  inviteStaffSchema,
  navLinkSchema,
  orderStatusUpdateSchema,
  productInputSchema,
  refundSchema,
  rolePermissionsSchema,
  staffRolesSchema,
  stockAdjustmentSchema,
} from "@/lib/validation/admin";
import {
  createProduct,
  deleteProduct,
  setProductFeatured,
  setProductStatus,
  updateProduct,
} from "@/server/services/product-admin.service";
import { adjustStock, setLowStockThreshold } from "@/server/services/inventory.service";
import { cancelOrder, updateFulfilment } from "@/server/services/order.service";
import { refundOrder } from "@/server/services/payment.service";
import { assignModel, deleteModel, deleteProductImage, processModelAsset, unassignModel } from "@/server/services/asset.service";
import {
  deleteCategory,
  deleteCollection,
  deleteContentBlock,
  deleteNavLink,
  inviteStaff,
  moderateReview,
  resetStaffAccess,
  revokeInvitation,
  saveBrand,
  saveCategory,
  saveCollection,
  saveContentBlock,
  saveCoupon,
  saveNavLink,
  setRolePermissions,
  setStaffAccess,
  setUserStatus,
} from "@/server/services/admin.service";
import { db } from "@/lib/db/prisma";
import { audit } from "@/server/services/audit.service";

const id = z.object({ id: z.string().min(1) });

// ── Products ─────────────────────────────────────────────────

export const createProductAction = action(productInputSchema, async (input) => {
  const user = await requirePermission("products.write");
  const product = await createProduct(input, user);
  revalidatePath("/admin/products");
  return { id: product.id };
});

export const updateProductAction = action(productInputSchema.and(z.object({ id: z.string() })), async (input) => {
  const user = await requirePermission("products.write");
  await updateProduct(input.id, input, user);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${input.id}`);
  return { message: "Product saved" };
});

export const setProductStatusAction = action(id.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), async ({ id, status }) => {
  const user = await requirePermission("products.publish");
  await setProductStatus(id, status, user);
  revalidatePath("/admin/products");
  return { message: `Product ${status.toLowerCase()}` };
});

export const setProductFeaturedAction = action(id.extend({ isFeatured: z.boolean() }), async ({ id, isFeatured }) => {
  const user = await requirePermission("products.write");
  await setProductFeatured(id, isFeatured, user);
  revalidatePath("/admin/products");
  return { message: isFeatured ? "Marked as featured" : "Removed from featured" };
});

export const deleteProductAction = action(id, async ({ id }) => {
  const user = await requirePermission("products.delete");
  await deleteProduct(id, user);
  revalidatePath("/admin/products");
  return { message: "Product deleted" };
});

export const deleteProductImageAction = action(id.extend({ productId: z.string() }), async ({ id, productId }) => {
  const user = await requirePermission("assets.manage");
  await deleteProductImage(id, user);
  revalidatePath(`/admin/products/${productId}`);
  return { message: "Image removed" };
});

export const reorderImagesAction = action(z.object({ productId: z.string(), ids: z.array(z.string()).max(50) }), async ({ productId, ids }) => {
  await requirePermission("assets.manage");
  await db.$transaction(ids.map((imageId, i) => db.productImage.updateMany({ where: { id: imageId, productId }, data: { sortOrder: i } })));
  revalidatePath(`/admin/products/${productId}`);
  return { message: "Order saved" };
});

// ── 3D assets ────────────────────────────────────────────────

export const assignModelAction = action(id.extend({ productId: z.string().min(1) }), async ({ id, productId }) => {
  const user = await requirePermission("assets.manage");
  await assignModel(id, productId, user);
  revalidatePath("/admin/3d-assets");
  return { message: "Model assigned" };
});

export const unassignModelAction = action(id, async ({ id }) => {
  const user = await requirePermission("assets.manage");
  await unassignModel(id, user);
  revalidatePath("/admin/3d-assets");
  return { message: "Model unassigned" };
});

export const deleteModelAction = action(id, async ({ id }) => {
  const user = await requirePermission("assets.manage");
  await deleteModel(id, user);
  revalidatePath("/admin/3d-assets");
  return { message: "Model deleted" };
});

export const reprocessModelAction = action(id, async ({ id }) => {
  await requirePermission("assets.manage");
  const asset = await processModelAsset(id);
  revalidatePath("/admin/3d-assets");
  return { message: `Processing finished: ${asset.status.toLowerCase()}` };
});

// ── Inventory ────────────────────────────────────────────────

export const adjustStockAction = action(stockAdjustmentSchema, async (input) => {
  const user = await requirePermission("inventory.adjust");
  const result = await adjustStock(input, user.id);
  revalidatePath("/admin/inventory");
  return { message: `Stock updated — ${result.quantity} on hand` };
});

export const setThresholdAction = action(z.object({ variantId: z.string(), threshold: z.coerce.number().int().min(0).max(1000) }), async ({ variantId, threshold }) => {
  const user = await requirePermission("inventory.adjust");
  await setLowStockThreshold(variantId, threshold);
  await audit(user.id, "inventory.threshold_changed", "ProductVariant", variantId, { threshold });
  revalidatePath("/admin/inventory");
  return { message: "Threshold updated" };
});

// ── Orders ───────────────────────────────────────────────────

export const updateOrderStatusAction = action(orderStatusUpdateSchema, async (input) => {
  const user = await requirePermission("orders.update");
  await updateFulfilment({ ...input, note: input.note || undefined, carrier: input.carrier || undefined, trackingNumber: input.trackingNumber || undefined, trackingUrl: input.trackingUrl || undefined }, user);
  revalidatePath(`/admin/orders/${input.orderId}`);
  revalidatePath("/admin/orders");
  return { message: "Order updated" };
});

export const cancelOrderAction = action(cancelOrderSchema, async ({ orderId, reason }) => {
  const user = await requirePermission("orders.cancel");
  await cancelOrder(orderId, reason, user);
  revalidatePath(`/admin/orders/${orderId}`);
  return { message: "Order cancelled and stock released" };
});

export const refundOrderAction = action(refundSchema, async ({ orderId, sellerOrderId, amount, reason, restock }) => {
  const user = await requirePermission("orders.refund");
  const result = await refundOrder({ orderId, sellerOrderId: sellerOrderId || undefined, amountCents: Math.round(amount * 100), reason, restock }, user);
  revalidatePath(`/admin/orders/${orderId}`);
  return { message: result.status === "SUCCEEDED" ? "Refund issued" : `Refund recorded as ${result.status.toLowerCase()}${result.failureReason ? ` — ${result.failureReason}` : ""}` };
});

export const markRefundCompleteAction = action(id, async ({ id }) => {
  const user = await requirePermission("orders.refund");
  const refund = await db.refund.update({ where: { id }, data: { status: "SUCCEEDED" } });
  await audit(user.id, "refund.marked_complete", "Refund", id);
  revalidatePath(`/admin/orders/${refund.orderId}`);
  return { message: "Refund marked complete" };
});

// ── Customers & staff ────────────────────────────────────────

export const setCustomerStatusAction = action(id.extend({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3).max(300) }), async ({ id, status, reason }) => {
  const user = await requirePermission("customers.manage");
  await setUserStatus(id, status, user, reason);
  revalidatePath(`/admin/customers/${id}`);
  return { message: status === "SUSPENDED" ? "Account suspended" : "Account reactivated" };
});

export const setStaffStatusAction = action(id.extend({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3).max(300) }), async ({ id, status, reason }) => {
  const user = await requirePermission("staff.manage");
  await setUserStatus(id, status, user, reason);
  revalidatePath("/admin/staff");
  return { message: status === "SUSPENDED" ? "Staff account suspended" : "Staff account reactivated" };
});

export const inviteStaffAction = action(inviteStaffSchema, async ({ email, roleKeys }) => {
  const user = await requirePermission("staff.manage");
  await inviteStaff(email, roleKeys, user);
  revalidatePath("/admin/staff");
  return { message: `Invitation sent to ${email}` };
});

export const revokeInvitationAction = action(id, async ({ id }) => {
  const user = await requirePermission("staff.manage");
  await revokeInvitation(id, user);
  revalidatePath("/admin/staff");
  return { message: "Invitation revoked" };
});

export const setStaffAccessAction = action(staffRolesSchema, async ({ userId, roleKeys, permissions }) => {
  const user = await requirePermission("staff.manage");
  await setStaffAccess(userId, roleKeys, permissions as Permission[], user);
  revalidatePath("/admin/staff");
  return { message: "Access updated" };
});

export const resetStaffAccessAction = action(id, async ({ id }) => {
  const user = await requirePermission("staff.manage");
  await resetStaffAccess(id, user);
  revalidatePath("/admin/staff");
  return { message: "Sessions revoked, MFA reset and password reset email sent" };
});

export const setRolePermissionsAction = action(rolePermissionsSchema, async ({ roleId, permissions }) => {
  const user = await requirePermission("roles.manage");
  await setRolePermissions(roleId, permissions as Permission[], user);
  revalidatePath("/admin/roles");
  return { message: "Role updated" };
});

// ── Catalogue structure ──────────────────────────────────────

export const saveCategoryAction = action(categoryInputSchema.extend({ id: z.string().optional() }), async (input) => {
  const user = await requirePermission("categories.manage");
  await saveCategory(input, user);
  revalidatePath("/admin/categories");
  return { message: "Category saved" };
});

export const deleteCategoryAction = action(id, async ({ id }) => {
  const user = await requirePermission("categories.manage");
  await deleteCategory(id, user);
  revalidatePath("/admin/categories");
  return { message: "Category deleted" };
});

export const saveBrandAction = action(brandInputSchema.extend({ id: z.string().optional() }), async (input) => {
  const user = await requirePermission("categories.manage");
  await saveBrand(input, user);
  revalidatePath("/admin/categories");
  return { message: "Brand saved" };
});

export const saveCollectionAction = action(collectionInputSchema.extend({ id: z.string().optional() }), async (input) => {
  const user = await requirePermission("collections.manage");
  await saveCollection(input, user);
  revalidatePath("/admin/collections");
  return { message: "Collection saved" };
});

export const deleteCollectionAction = action(id, async ({ id }) => {
  const user = await requirePermission("collections.manage");
  await deleteCollection(id, user);
  revalidatePath("/admin/collections");
  return { message: "Collection deleted" };
});

// ── Content & promotions ─────────────────────────────────────

export const saveContentBlockAction = action(contentBlockSchema, async (input) => {
  const user = await requirePermission("content.manage");
  const blank = (v?: string) => (v ? v : null);
  await saveContentBlock(
    { ...input, subtitle: blank(input.subtitle), body: blank(input.body), imageUrl: blank(input.imageUrl), ctaLabel: blank(input.ctaLabel), ctaHref: blank(input.ctaHref) },
    user,
  );
  revalidatePath("/admin/content");
  revalidatePath("/");
  return { message: "Content saved" };
});

export const deleteContentBlockAction = action(id, async ({ id }) => {
  const user = await requirePermission("content.manage");
  await deleteContentBlock(id, user);
  revalidatePath("/admin/content");
  revalidatePath("/");
  return { message: "Content deleted" };
});

export const saveNavLinkAction = action(navLinkSchema, async (input) => {
  const user = await requirePermission("content.manage");
  await saveNavLink({ ...input, group: input.group || null }, user);
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
  return { message: "Link saved" };
});

export const deleteNavLinkAction = action(id, async ({ id }) => {
  const user = await requirePermission("content.manage");
  await deleteNavLink(id, user);
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
  return { message: "Link deleted" };
});

export const saveCouponAction = action(couponInputSchema, async (input) => {
  const user = await requirePermission("promotions.manage");
  await saveCoupon(input, user);
  revalidatePath("/admin/content");
  return { message: "Coupon saved" };
});

export const moderateReviewAction = action(id.extend({ status: z.enum(["APPROVED", "REJECTED"]) }), async ({ id, status }) => {
  const user = await requirePermission("reviews.moderate");
  await moderateReview(id, status, user);
  revalidatePath("/admin/content");
  return { message: `Review ${status.toLowerCase()}` };
});
