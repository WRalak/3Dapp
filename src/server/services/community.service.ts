import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db/prisma";
import { AppError, badRequest, conflict, notFound, rateLimited } from "@/lib/errors";
import { sha256, safeEqual } from "@/lib/security/crypto";
import { limitBy } from "@/lib/security/rate-limit";
import { maskPhone } from "@/lib/utils";
import { enqueue } from "@/server/jobs/queue";
import type { AuthUser } from "@/lib/auth/guards";
import type { SellerContext } from "@/lib/auth/seller-guard";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

// ─── Customer ↔ seller messages ───────────────────────────────────────────────

export async function createInquiry(user: AuthUser, input: { sellerId: string; productId?: string; subject: string; message: string }) {
  if (!(await limitBy("inquiry", user.id)).success) throw rateLimited();
  const seller = await db.seller.findFirst({ where: { id: input.sellerId, status: "APPROVED" }, select: { id: true, ownerId: true, businessName: true } });
  if (!seller) throw notFound("Designer");
  if (seller.ownerId === user.id) throw badRequest("You can't message your own store");
  if (input.productId && !(await db.product.findFirst({ where: { id: input.productId, sellerId: seller.id }, select: { id: true } }))) throw notFound("Product");
  const inquiry = await db.$transaction(async (tx) => {
    const created = await tx.sellerInquiry.create({
      data: { sellerId: seller.id, customerId: user.id, productId: input.productId ?? null, subject: input.subject, messages: { create: { authorId: user.id, body: input.message } } },
    });
    await notify(seller.ownerId, "INQUIRY", "New customer message", input.subject, `/seller/inquiries/${created.id}`, tx);
    return created;
  });
  return inquiry;
}

/** Either party may reply; access is checked against the thread's customer or the seller's owner. */
export async function replyToInquiry(user: AuthUser, input: { inquiryId: string; message: string }) {
  if (!(await limitBy("inquiry", user.id)).success) throw rateLimited();
  const thread = await db.sellerInquiry.findUnique({ where: { id: input.inquiryId }, include: { seller: { select: { ownerId: true, businessName: true } } } });
  if (!thread) throw notFound("Conversation");
  const isCustomer = thread.customerId === user.id;
  const isSeller = thread.seller.ownerId === user.id;
  if (!isCustomer && !isSeller) throw notFound("Conversation");
  if (thread.status === "CLOSED") throw badRequest("This conversation is closed");
  await db.$transaction(async (tx) => {
    await tx.inquiryMessage.create({ data: { inquiryId: thread.id, authorId: user.id, body: input.message } });
    await tx.sellerInquiry.update({ where: { id: thread.id }, data: { status: isSeller ? "ANSWERED" : "OPEN" } });
    if (isSeller) await notify(thread.customerId, "INQUIRY", `${thread.seller.businessName} replied`, thread.subject, `/account/messages/${thread.id}`, tx);
    else await notify(thread.seller.ownerId, "INQUIRY", "Customer replied", thread.subject, `/seller/inquiries/${thread.id}`, tx);
  });
}

export async function closeInquiry(ctx: SellerContext, inquiryId: string) {
  const res = await db.sellerInquiry.updateMany({ where: { id: inquiryId, sellerId: ctx.seller.id }, data: { status: "CLOSED" } });
  if (!res.count) throw notFound("Conversation");
}

export async function getInquiryThread(user: AuthUser, inquiryId: string) {
  const thread = await db.sellerInquiry.findUnique({
    where: { id: inquiryId },
    include: {
      seller: { select: { ownerId: true, businessName: true, slug: true } },
      customer: { select: { name: true } },
      product: { select: { name: true, slug: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
    },
  });
  if (!thread || (thread.customerId !== user.id && thread.seller.ownerId !== user.id)) return null;
  return thread;
}

export async function listCustomerInquiries(userId: string) {
  return db.sellerInquiry.findMany({ where: { customerId: userId }, orderBy: { updatedAt: "desc" }, include: { seller: { select: { businessName: true } }, _count: { select: { messages: true } } }, take: 100 });
}

export async function listSellerInquiries(sellerId: string, status?: "OPEN" | "ANSWERED" | "CLOSED") {
  return db.sellerInquiry.findMany({
    where: { sellerId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { customer: { select: { name: true } }, product: { select: { name: true } }, _count: { select: { messages: true } } },
    take: 100,
  });
}

// ─── Product reports ─────────────────────────────────────────────────────────

export async function reportProduct(user: AuthUser, input: { productId: string; reason: string; details?: string }) {
  if (!(await limitBy("report", user.id)).success) throw rateLimited();
  const product = await db.product.findFirst({ where: { id: input.productId, deletedAt: null }, select: { id: true } });
  if (!product) throw notFound("Product");
  const dupe = await db.productReport.findFirst({ where: { productId: product.id, reporterId: user.id, status: "OPEN" } });
  if (dupe) throw conflict("You've already reported this product — our team is reviewing it");
  return db.productReport.create({ data: { productId: product.id, reporterId: user.id, reason: input.reason, details: input.details || null } });
}

export async function resolveReport(id: string, input: { status: "RESOLVED" | "DISMISSED"; resolution: string; hideProduct?: boolean }, actor: AuthUser) {
  const report = await db.productReport.findUnique({ where: { id }, include: { product: { select: { id: true, slug: true } } } });
  if (!report) throw notFound("Report");
  await db.$transaction(async (tx) => {
    await tx.productReport.update({ where: { id }, data: { status: input.status, resolution: input.resolution, resolvedAt: new Date() } });
    if (input.hideProduct) await tx.product.update({ where: { id: report.productId }, data: { approvalStatus: "REJECTED", rejectionReason: `Removed after report: ${input.resolution}` } });
  });
  await audit(actor.id, `report.${input.status.toLowerCase()}`, "ProductReport", id, { hideProduct: !!input.hideProduct, productId: report.productId });
  if (input.hideProduct) {
    const { invalidateCatalogCache } = await import("./catalog.service");
    await invalidateCatalogCache(report.product.slug);
  }
}

// ─── Phone verification (SMS one-time code) ─────────────────────────────────

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

export async function startPhoneVerification(user: AuthUser, phone: string) {
  if (!(await limitBy("phoneOtp", user.id)).success) throw rateLimited("Too many codes requested. Try again in a few minutes.");
  const taken = await db.user.findFirst({ where: { phone, id: { not: user.id }, phoneVerifiedAt: { not: null } }, select: { id: true } });
  if (taken) throw new AppError("VALIDATION", "This number is already verified on another account", { phone: ["Already in use"] });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.$transaction(async (tx) => {
    await tx.phoneVerification.deleteMany({ where: { userId: user.id, verifiedAt: null } });
    await tx.phoneVerification.create({ data: { userId: user.id, phone, codeHash: sha256(`${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    await enqueue("sms.send", { to: phone, message: `Your Mtindo verification code is ${code}. It expires in 10 minutes. Never share it.` }, { tx });
  });
  return { sentTo: maskPhone(phone) };
}

export async function confirmPhoneVerification(user: AuthUser, code: string) {
  if (!(await limitBy("phoneOtpVerify", user.id)).success) throw rateLimited();
  const pending = await db.phoneVerification.findFirst({ where: { userId: user.id, verifiedAt: null }, orderBy: { createdAt: "desc" } });
  if (!pending || pending.expiresAt < new Date()) throw new AppError("VALIDATION", "The code has expired — request a new one", { code: ["Expired"] });
  if (pending.attempts >= OTP_MAX_ATTEMPTS) throw new AppError("VALIDATION", "Too many wrong attempts — request a new code", { code: ["Too many attempts"] });
  if (!safeEqual(pending.codeHash, sha256(`${user.id}:${code}`))) {
    await db.phoneVerification.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("VALIDATION", "That code isn't right", { code: ["Incorrect code"] });
  }
  await db.$transaction(async (tx) => {
    await tx.phoneVerification.update({ where: { id: pending.id }, data: { verifiedAt: new Date() } });
    // Unique on User.phone: release the number from any unverified holder first.
    await tx.user.updateMany({ where: { phone: pending.phone, id: { not: user.id }, phoneVerifiedAt: null }, data: { phone: null } });
    await tx.user.update({ where: { id: user.id }, data: { phone: pending.phone, phoneVerifiedAt: new Date() } });
  });
  await audit(user.id, "account.phone_verified", "User", user.id, { phone: maskPhone(pending.phone) });
}
