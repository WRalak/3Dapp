import "server-only";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { AppError, badRequest, conflict, notFound } from "@/lib/errors";
import { encrypt } from "@/lib/security/crypto";
import { maskPhone, normaliseKenyanPhone, slugify } from "@/lib/utils";
import { sniffDocument } from "@/features/uploads/file-validation";
import type { AuthUser } from "@/lib/auth/guards";
import type { SellerContext } from "@/lib/auth/seller-guard";
import type { z } from "zod";
import type { payoutDetailsSchema, sellerApplicationSchema, storeProfileSchema } from "@/lib/validation/marketplace";
import type { SellerDocumentType, SellerStatus } from "@/generated/prisma/client";
import { audit } from "./audit.service";
import { readClaim } from "./asset.service";
import { notify } from "./notification.service";
import { invalidateCatalogCache } from "./catalog.service";

type Application = z.output<typeof sellerApplicationSchema>;
type StoreProfile = z.output<typeof storeProfileSchema>;
type PayoutDetails = z.output<typeof payoutDetailsSchema>;

export const HOUSE_SELLER_ID = "house-seller";

async function uniqueSellerSlug(name: string, excludeId?: string) {
  const root = slugify(name) || "designer";
  let candidate = root;
  for (let i = 2; i < 100; i++) {
    const clash = await db.seller.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return candidate;
    candidate = `${root}-${i}`;
  }
  throw conflict("Could not generate a unique store URL");
}

const orNull = (v: string | null | undefined) => (v ? v : null);

/** A customer applies to sell. One seller account per user; re-applying after rejection resubmits. */
export async function applyAsSeller(user: AuthUser, input: Application) {
  const existing = await db.seller.findUnique({ where: { ownerId: user.id } });
  if (existing && existing.status !== "REJECTED") throw conflict("You already have a seller application");
  const county = await db.county.findUnique({ where: { id: input.countyId } });
  if (!county) throw badRequest("Choose a valid county");
  const profile = {
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    description: input.description,
    categories: input.categories,
    website: orNull(input.website),
    instagram: orNull(input.instagram?.replace(/^@/, "")),
    registrationNumber: orNull(input.registrationNumber),
    kraPin: orNull(input.kraPin),
    logoUrl: orNull(input.logoUrl),
    coverUrl: orNull(input.coverUrl),
    payoutMpesaPhone: input.phone,
  };
  const seller = await db.$transaction(async (tx) => {
    const s = existing
      ? await tx.seller.update({
          where: { id: existing.id },
          data: { businessName: input.businessName, businessType: input.businessType, countyId: county.id, town: input.town, status: "PENDING", rejectionReason: null, profile: { update: profile } },
        })
      : await tx.seller.create({
          data: {
            ownerId: user.id,
            slug: await uniqueSellerSlug(input.businessName),
            businessName: input.businessName,
            businessType: input.businessType,
            countyId: county.id,
            town: input.town,
            profile: { create: profile },
            wallet: { create: {} },
          },
        });
    await tx.sellerVerification.create({ data: { sellerId: s.id, decision: "SUBMITTED", reviewerId: null, notes: existing ? "Resubmitted" : null } });
    return s;
  });
  await audit(user.id, existing ? "seller.resubmitted" : "seller.applied", "Seller", seller.id, { businessName: seller.businessName });
  return seller;
}

/** Applicant-scoped: register an uploaded verification document (private storage). */
export async function addSellerDocument(ctx: SellerContext, input: { claim: string; type: SellerDocumentType }) {
  const c = readClaim(input.claim, ctx.user);
  if (c.kind !== "document" || !c.key.startsWith("private/")) throw badRequest("Upload session is invalid");
  const size = await storage().size(c.key);
  if (size == null || size !== c.size) throw badRequest("Upload incomplete — please try again");
  const head = (await storage().read(c.key)).subarray(0, 16);
  const sniffed = sniffDocument(head);
  if (!sniffed) {
    await storage().remove(c.key);
    throw new AppError("VALIDATION", "That file isn't a PDF, JPEG or PNG");
  }
  const count = await db.sellerDocument.count({ where: { sellerId: ctx.seller.id } });
  if (count >= 10) throw badRequest("You can upload up to 10 documents");
  const doc = await db.sellerDocument.create({ data: { sellerId: ctx.seller.id, type: input.type, fileKey: c.key, fileName: c.name, contentType: sniffed, size } });
  await audit(ctx.user.id, "seller.document_uploaded", "SellerDocument", doc.id, { type: input.type });
  return doc;
}

export async function removeSellerDocument(ctx: SellerContext, documentId: string) {
  const doc = await db.sellerDocument.findFirst({ where: { id: documentId, sellerId: ctx.seller.id } });
  if (!doc) throw notFound("Document");
  if (doc.status === "ACCEPTED") throw badRequest("Accepted documents can't be removed");
  await db.sellerDocument.delete({ where: { id: doc.id } });
  await storage().remove(doc.fileKey);
  await audit(ctx.user.id, "seller.document_removed", "SellerDocument", doc.id);
}

/** Staff-only document access: bytes are streamed through an authorised route, never via /media. */
export async function readSellerDocument(documentId: string, actor: AuthUser) {
  const doc = await db.sellerDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw notFound("Document");
  await audit(actor.id, "seller.document_viewed", "SellerDocument", doc.id, { sellerId: doc.sellerId });
  return { doc, body: await storage().read(doc.fileKey) };
}

export async function updateStoreProfile(ctx: SellerContext, input: StoreProfile) {
  const county = await db.county.findUnique({ where: { id: input.countyId } });
  if (!county) throw badRequest("Choose a valid county");
  await db.seller.update({
    where: { id: ctx.seller.id },
    data: {
      businessName: input.businessName,
      countyId: county.id,
      town: input.town,
      profile: {
        update: {
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          description: input.description,
          categories: input.categories,
          website: orNull(input.website),
          instagram: orNull(input.instagram?.replace(/^@/, "")),
          registrationNumber: orNull(input.registrationNumber),
          kraPin: orNull(input.kraPin),
          logoUrl: orNull(input.logoUrl),
          coverUrl: orNull(input.coverUrl),
          returnPolicy: orNull(input.returnPolicy),
        },
      },
    },
  });
  await audit(ctx.user.id, "seller.profile_updated", "Seller", ctx.seller.id);
  await invalidateCatalogCache();
}

/** Payout destination changes are financial events: audited, and account numbers encrypted at rest. */
export async function updatePayoutDetails(ctx: SellerContext, input: PayoutDetails) {
  const data =
    input.method === "MPESA"
      ? { payoutMethod: "MPESA" as const, payoutMpesaPhone: normaliseKenyanPhone(input.mpesaPhone ?? ""), payoutBankName: null, payoutAccountName: null, payoutAccountNumberEnc: null }
      : {
          payoutMethod: "BANK_TRANSFER" as const,
          payoutMpesaPhone: null,
          payoutBankName: input.bankName!,
          payoutAccountName: input.accountName!,
          payoutAccountNumberEnc: encrypt(input.accountNumber!, env().ENCRYPTION_KEY),
        };
  await db.sellerProfile.update({ where: { sellerId: ctx.seller.id }, data });
  await audit(ctx.user.id, "seller.payout_details_changed", "Seller", ctx.seller.id, {
    method: input.method,
    destination: input.method === "MPESA" ? maskPhone(data.payoutMpesaPhone ?? "") : `${input.bankName} ••••${input.accountNumber!.slice(-4)}`,
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function listSellers(opts: { status?: SellerStatus; q?: string; page?: number; take?: number } = {}) {
  const take = opts.take ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    deletedAt: null,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q ? { OR: [{ businessName: { contains: opts.q, mode: "insensitive" as const } }, { owner: { email: { contains: opts.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.seller.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: { county: true, owner: { select: { email: true, name: true } }, wallet: true, _count: { select: { products: true, sellerOrders: true, documents: true } } },
    }),
    db.seller.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getSellerForAdmin(id: string) {
  const seller = await db.seller.findUnique({
    where: { id },
    include: {
      county: true,
      owner: { select: { id: true, email: true, name: true, phone: true, phoneVerifiedAt: true, createdAt: true } },
      profile: true,
      documents: { orderBy: { createdAt: "desc" } },
      verifications: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true, email: true } } } },
      wallet: true,
      _count: { select: { products: true, sellerOrders: true, followers: true } },
    },
  });
  if (!seller) throw notFound("Seller");
  return seller;
}

const TRANSITIONS: Record<string, { from: SellerStatus[]; to: SellerStatus; decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "SUSPENDED" | "REACTIVATED" }> = {
  approve: { from: ["PENDING", "REJECTED"], to: "APPROVED", decision: "APPROVED" },
  reject: { from: ["PENDING"], to: "REJECTED", decision: "REJECTED" },
  requestChanges: { from: ["PENDING"], to: "REJECTED", decision: "CHANGES_REQUESTED" },
  suspend: { from: ["APPROVED"], to: "SUSPENDED", decision: "SUSPENDED" },
  reactivate: { from: ["SUSPENDED"], to: "APPROVED", decision: "REACTIVATED" },
};

export type SellerDecision = keyof typeof TRANSITIONS;

/** Approval workflow. Every decision is recorded in the append-only SellerVerification history and the audit log. */
export async function decideSeller(id: string, decision: SellerDecision, notes: string | null, actor: AuthUser) {
  const rule = TRANSITIONS[decision];
  if (!rule) throw badRequest("Unknown decision");
  if ((decision === "reject" || decision === "requestChanges" || decision === "suspend") && !notes?.trim()) throw new AppError("VALIDATION", "Give the seller a reason", { notes: ["Required"] });
  const seller = await db.seller.findUnique({ where: { id }, include: { owner: { select: { id: true, roles: { include: { role: true } } } } } });
  if (!seller) throw notFound("Seller");
  if (!rule.from.includes(seller.status)) throw conflict(`Can't ${decision} a seller who is ${seller.status.toLowerCase()}`);
  const sellerRole = await db.role.upsert({ where: { key: "SELLER" }, update: {}, create: { key: "SELLER", name: "Seller", description: "Marketplace seller", isSystem: true } });
  await db.$transaction(async (tx) => {
    await tx.seller.update({
      where: { id },
      data: {
        status: rule.to,
        rejectionReason: rule.to === "REJECTED" ? notes : null,
        ...(rule.to === "APPROVED" ? { approvedAt: seller.approvedAt ?? new Date(), suspendedAt: null } : {}),
        ...(rule.to === "SUSPENDED" ? { suspendedAt: new Date() } : {}),
      },
    });
    await tx.sellerVerification.create({ data: { sellerId: id, decision: rule.decision, notes, reviewerId: actor.id } });
    if (rule.to === "APPROVED") {
      await tx.userRole.upsert({ where: { userId_roleId: { userId: seller.ownerId, roleId: sellerRole.id } }, create: { userId: seller.ownerId, roleId: sellerRole.id }, update: {} });
    }
    const messages: Record<string, [string, string]> = {
      approve: ["Your store is approved", "Welcome to Mtindo! You can now list products from your seller dashboard."],
      reject: ["Your seller application", `Unfortunately we couldn't approve your application: ${notes}`],
      requestChanges: ["Changes requested", `Please update your application: ${notes}`],
      suspend: ["Your store is suspended", `Your products are hidden while we review your account: ${notes}`],
      reactivate: ["Your store is active again", "Your products are visible to customers again."],
    };
    const [title, body] = messages[decision]!;
    await notify(seller.ownerId, "SELLER", title, body, rule.to === "APPROVED" ? "/seller" : "/sell/status", tx);
  });
  await audit(actor.id, `seller.${decision}`, "Seller", id, { notes, from: seller.status, to: rule.to });
  await invalidateCatalogCache();
}

export async function reviewDocument(documentId: string, status: "ACCEPTED" | "REJECTED", note: string | null, actor: AuthUser) {
  const doc = await db.sellerDocument.update({ where: { id: documentId }, data: { status, note, reviewedAt: new Date() } }).catch(() => null);
  if (!doc) throw notFound("Document");
  await audit(actor.id, `seller.document_${status.toLowerCase()}`, "SellerDocument", doc.id, { sellerId: doc.sellerId, note });
  return doc;
}

/** Commission override (basis points). `null` falls back to category, then platform default. */
export async function setSellerCommission(id: string, rateBps: number | null, actor: AuthUser) {
  if (rateBps != null && (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 5000)) throw new AppError("VALIDATION", "Commission must be between 0% and 50%");
  const before = await db.seller.findUnique({ where: { id }, select: { commissionRateBps: true } });
  if (!before) throw notFound("Seller");
  await db.seller.update({ where: { id }, data: { commissionRateBps: rateBps } });
  await audit(actor.id, "seller.commission_changed", "Seller", id, { from: before.commissionRateBps, to: rateBps });
}

export async function setSellerFeatured(id: string, isFeatured: boolean, actor: AuthUser) {
  await db.seller.update({ where: { id }, data: { isFeatured } });
  await audit(actor.id, "seller.featured", "Seller", id, { isFeatured });
  await invalidateCatalogCache();
}

// ─── Public ───────────────────────────────────────────────────────────────────

export async function listPublicSellers(opts: { countyId?: string; q?: string; featured?: boolean; take?: number } = {}) {
  return db.seller.findMany({
    where: {
      status: "APPROVED",
      deletedAt: null,
      ...(opts.countyId ? { countyId: opts.countyId } : {}),
      ...(opts.featured ? { isFeatured: true } : {}),
      ...(opts.q ? { businessName: { contains: opts.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { followerCount: "desc" }, { businessName: "asc" }],
    take: opts.take ?? 60,
    select: {
      id: true,
      slug: true,
      businessName: true,
      businessType: true,
      town: true,
      isFeatured: true,
      followerCount: true,
      ratingAvg: true,
      county: { select: { name: true, slug: true } },
      profile: { select: { description: true, logoUrl: true, coverUrl: true } },
      _count: { select: { products: { where: { status: "PUBLISHED", approvalStatus: "APPROVED", deletedAt: null } } } },
    },
  });
}

export async function getPublicSeller(slug: string) {
  const seller = await db.seller.findFirst({
    where: { slug, status: "APPROVED", deletedAt: null },
    select: {
      id: true,
      slug: true,
      businessName: true,
      businessType: true,
      town: true,
      followerCount: true,
      ratingAvg: true,
      approvedAt: true,
      county: { select: { id: true, name: true, slug: true } },
      profile: { select: { description: true, logoUrl: true, coverUrl: true, website: true, instagram: true, returnPolicy: true, categories: true } },
      zones: { where: { isActive: true }, select: { counties: { select: { county: { select: { name: true } } } }, methods: { where: { isActive: true }, select: { type: true } } } },
    },
  });
  return seller;
}

export async function followSeller(userId: string, sellerId: string, follow: boolean) {
  const seller = await db.seller.findFirst({ where: { id: sellerId, status: "APPROVED" }, select: { id: true, ownerId: true } });
  if (!seller) throw notFound("Designer");
  if (seller.ownerId === userId) throw badRequest("You can't follow your own store");
  await db.$transaction(async (tx) => {
    if (follow) {
      const created = await tx.sellerFollow.createMany({ data: [{ userId, sellerId }], skipDuplicates: true });
      if (created.count) await tx.seller.update({ where: { id: sellerId }, data: { followerCount: { increment: 1 } } });
    } else {
      const removed = await tx.sellerFollow.deleteMany({ where: { userId, sellerId } });
      if (removed.count) await tx.seller.update({ where: { id: sellerId }, data: { followerCount: { decrement: 1 } } });
    }
  });
}

export async function isFollowing(userId: string | undefined, sellerId: string) {
  if (!userId) return false;
  return !!(await db.sellerFollow.findUnique({ where: { userId_sellerId: { userId, sellerId } } }));
}
