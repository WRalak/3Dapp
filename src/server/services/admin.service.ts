import "server-only";
import { db } from "@/lib/db/prisma";
import { AppError, badRequest, forbidden, notFound } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { slugify } from "@/lib/utils";
import { revokeUserSessions } from "@/lib/auth/session";
import type { AuthUser } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { enqueue } from "@/server/jobs/queue";
import { audit } from "./audit.service";
import { invalidateCatalogCache } from "./catalog.service";
import type { Prisma } from "@/generated/prisma/client";

const orNull = (v?: string | null) => (v ? v : null);

// ── Customers ────────────────────────────────────────────────

export async function listCustomers(opts: { q?: string; status?: string; page: number }) {
  const pageSize = 25;
  const where: Prisma.UserWhereInput = {
    isStaff: false,
    deletedAt: null,
    ...(opts.status === "SUSPENDED" || opts.status === "ACTIVE" ? { status: opts.status } : {}),
    ...(opts.q ? { OR: [{ email: { contains: opts.q, mode: "insensitive" } }, { name: { contains: opts.q, mode: "insensitive" } }] } : {}),
  };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, name: true, status: true, createdAt: true, lastLoginAt: true, emailVerifiedAt: true, _count: { select: { orders: true } } },
    }),
  ]);
  const spend = await db.order.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) }, status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } },
    _sum: { totalCents: true },
  });
  const spendBy = new Map(spend.map((s) => [s.userId, s._sum.totalCents ?? 0]));
  return { total, pageCount: Math.max(1, Math.ceil(total / pageSize)), items: users.map((u) => ({ ...u, lifetimeCents: spendBy.get(u.id) ?? 0 })) };
}

export async function getCustomer(id: string) {
  return db.user.findFirst({
    where: { id, isStaff: false },
    include: {
      profile: true,
      addresses: { where: { deletedAt: null } },
      orders: { orderBy: { placedAt: "desc" }, take: 50 },
      reviews: { include: { product: { select: { name: true, slug: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 10 },
    },
  });
}

export async function setUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED", actor: AuthUser, reason: string) {
  if (userId === actor.id) throw badRequest("You cannot change your own account status");
  const target = await db.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!target) throw notFound("User");
  if (target.isStaff && !actor.permissions.includes("staff.manage")) throw forbidden();
  if (target.roles.some((r) => r.role.key === "SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) throw forbidden();
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await revokeUserSessions(userId);
  await audit(actor.id, status === "SUSPENDED" ? "user.suspended" : "user.reactivated", "User", userId, { reason });
}

// ── Staff, roles & permissions ───────────────────────────────

export async function listStaff() {
  return db.user.findMany({
    where: { isStaff: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { roles: { include: { role: true } }, permissions: { include: { permission: true } } },
  });
}

export async function listRoles() {
  return db.role.findMany({ orderBy: { name: "asc" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } });
}

export async function inviteStaff(email: string, roleKeys: string[], actor: AuthUser) {
  if (roleKeys.includes("SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) throw forbidden("Only a super admin can grant super admin");
  const roles = await db.role.findMany({ where: { key: { in: roleKeys } } });
  if (roles.length !== roleKeys.length) throw badRequest("Unknown role");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.isStaff) throw new AppError("CONFLICT", "This person is already a staff member", { email: ["Already staff"] });
  await db.adminInvitation.updateMany({ where: { email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomToken(32);
  const invite = await db.adminInvitation.create({
    data: { email, roleIds: roles.map((r) => r.id), tokenHash: sha256(token), invitedById: actor.id, expiresAt: new Date(Date.now() + 72 * 3600_000) },
  });
  await enqueue("email.staffInvite", { invitationId: invite.id, token });
  await audit(actor.id, "staff.invited", "AdminInvitation", invite.id, { email, roles: roleKeys });
  return invite;
}

export async function revokeInvitation(id: string, actor: AuthUser) {
  await db.adminInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(actor.id, "staff.invitation_revoked", "AdminInvitation", id);
}

export async function listInvitations() {
  return db.adminInvitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { invitedBy: { select: { email: true } } } });
}

/** Replaces a staff member's roles and direct permission grants. */
export async function setStaffAccess(userId: string, roleKeys: string[], permissions: Permission[], actor: AuthUser) {
  if (userId === actor.id) throw badRequest("You cannot change your own access");
  const target = await db.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!target?.isStaff) throw notFound("Staff member");
  const touchesSuper = roleKeys.includes("SUPER_ADMIN") || target.roles.some((r) => r.role.key === "SUPER_ADMIN");
  if (touchesSuper && !actor.roles.includes("SUPER_ADMIN")) throw forbidden("Only a super admin can change super admin access");
  if (target.roles.some((r) => r.role.key === "SUPER_ADMIN") && !roleKeys.includes("SUPER_ADMIN")) {
    const supers = await db.userRole.count({ where: { role: { key: "SUPER_ADMIN" }, user: { status: "ACTIVE", deletedAt: null } } });
    if (supers <= 1) throw badRequest("At least one active super admin is required");
  }
  const [roles, perms] = await Promise.all([db.role.findMany({ where: { key: { in: roleKeys } } }), db.permission.findMany({ where: { key: { in: permissions } } })]);
  await db.$transaction([
    db.userRole.deleteMany({ where: { userId } }),
    db.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id, assignedById: actor.id })) }),
    db.userPermission.deleteMany({ where: { userId } }),
    db.userPermission.createMany({ data: perms.map((p) => ({ userId, permissionId: p.id })) }),
  ]);
  await audit(actor.id, "staff.access_changed", "User", userId, { roles: roleKeys, permissions });
}

/** Forces re-authentication and MFA re-enrolment for a staff member. */
export async function resetStaffAccess(userId: string, actor: AuthUser) {
  if (userId === actor.id) throw badRequest("Use your own security settings instead");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target?.isStaff) throw notFound("Staff member");
  await db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null, failedLoginCount: 0, lockedUntil: null } });
  await revokeUserSessions(userId);
  const token = randomToken(32);
  await db.verificationToken.create({ data: { userId, type: "PASSWORD_RESET", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
  await enqueue("email.passwordReset", { userId, token });
  await audit(actor.id, "staff.access_reset", "User", userId);
}

export async function setRolePermissions(roleId: string, permissions: Permission[], actor: AuthUser) {
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) throw notFound("Role");
  if (role.key === "SUPER_ADMIN") throw badRequest("Super admin always has every permission");
  if (role.key === "CUSTOMER" && permissions.length) throw badRequest("Customers cannot hold admin permissions");
  const perms = await db.permission.findMany({ where: { key: { in: permissions } } });
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
  ]);
  await audit(actor.id, "role.permissions_changed", "Role", roleId, { role: role.key, permissions });
}

export async function listAuditLog(opts: { actorId?: string; q?: string; page: number }) {
  const pageSize = 50;
  const where: Prisma.AuditLogWhereInput = {
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    ...(opts.q ? { OR: [{ action: { contains: opts.q } }, { entityType: { contains: opts.q } }, { entityId: opts.q }] } : {}),
  };
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (opts.page - 1) * pageSize, take: pageSize, include: { actor: { select: { email: true, name: true } } } }),
  ]);
  return { total, items, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

// ── Categories, brands & collections ─────────────────────────

async function freeSlug(model: "category" | "brand" | "collection", base: string, excludeId?: string) {
  const root = slugify(base);
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const where = { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) };
    const clash =
      model === "category" ? await db.category.findFirst({ where }) : model === "brand" ? await db.brand.findFirst({ where }) : await db.collection.findFirst({ where });
    if (!clash) return candidate;
    candidate = `${root}-${i}`;
  }
  throw badRequest("Could not generate a unique slug");
}

export async function saveCategory(input: { id?: string; name: string; slug?: string; description?: string; parentId?: string; sortOrder: number; isActive: boolean }, actor: AuthUser) {
  if (input.id && input.parentId === input.id) throw badRequest("A category cannot be its own parent");
  const data = { name: input.name, description: orNull(input.description), parentId: orNull(input.parentId), sortOrder: input.sortOrder, isActive: input.isActive };
  const slug = await freeSlug("category", input.slug || input.name, input.id);
  const cat = input.id ? await db.category.update({ where: { id: input.id }, data: { ...data, slug } }) : await db.category.create({ data: { ...data, slug } });
  await audit(actor.id, input.id ? "category.updated" : "category.created", "Category", cat.id, { name: cat.name });
  await invalidateCatalogCache();
  return cat;
}

export async function deleteCategory(id: string, actor: AuthUser) {
  const count = await db.product.count({ where: { categoryId: id, deletedAt: null } });
  if (count) throw badRequest(`Move the ${count} product(s) in this category first`);
  await db.category.delete({ where: { id } });
  await audit(actor.id, "category.deleted", "Category", id);
  await invalidateCatalogCache();
}

export async function saveBrand(input: { id?: string; name: string; slug?: string; description?: string; isFeatured: boolean }, actor: AuthUser) {
  const slug = await freeSlug("brand", input.slug || input.name, input.id);
  const data = { name: input.name, slug, description: orNull(input.description), isFeatured: input.isFeatured };
  const brand = input.id ? await db.brand.update({ where: { id: input.id }, data }) : await db.brand.create({ data });
  await audit(actor.id, input.id ? "brand.updated" : "brand.created", "Brand", brand.id, { name: brand.name });
  await invalidateCatalogCache();
  return brand;
}

export async function saveCollection(
  input: { id?: string; name: string; slug?: string; description?: string; heroImageUrl?: string; isFeatured: boolean; isActive: boolean; sortOrder: number },
  actor: AuthUser,
) {
  const slug = await freeSlug("collection", input.slug || input.name, input.id);
  const data = { name: input.name, slug, description: orNull(input.description), heroImageUrl: orNull(input.heroImageUrl), isFeatured: input.isFeatured, isActive: input.isActive, sortOrder: input.sortOrder };
  const c = input.id ? await db.collection.update({ where: { id: input.id }, data }) : await db.collection.create({ data });
  await audit(actor.id, input.id ? "collection.updated" : "collection.created", "Collection", c.id, { name: c.name });
  await invalidateCatalogCache();
  return c;
}

export async function deleteCollection(id: string, actor: AuthUser) {
  await db.collection.delete({ where: { id } });
  await audit(actor.id, "collection.deleted", "Collection", id);
  await invalidateCatalogCache();
}

// ── Content, navigation, coupons, reviews ────────────────────

export async function saveContentBlock(input: Prisma.ContentBlockUncheckedCreateInput & { id?: string }, actor: AuthUser) {
  const { id, ...data } = input;
  const block = id ? await db.contentBlock.update({ where: { id }, data }) : await db.contentBlock.create({ data });
  await audit(actor.id, id ? "content.updated" : "content.created", "ContentBlock", block.id, { placement: block.placement });
  await invalidateCatalogCache();
  return block;
}

export async function deleteContentBlock(id: string, actor: AuthUser) {
  await db.contentBlock.delete({ where: { id } });
  await audit(actor.id, "content.deleted", "ContentBlock", id);
  await invalidateCatalogCache();
}

export async function saveNavLink(input: Prisma.NavigationLinkUncheckedCreateInput & { id?: string }, actor: AuthUser) {
  const { id, ...data } = input;
  const link = id ? await db.navigationLink.update({ where: { id }, data }) : await db.navigationLink.create({ data });
  await audit(actor.id, id ? "nav.updated" : "nav.created", "NavigationLink", link.id);
  return link;
}

export async function deleteNavLink(id: string, actor: AuthUser) {
  await db.navigationLink.delete({ where: { id } });
  await audit(actor.id, "nav.deleted", "NavigationLink", id);
}

export async function saveCoupon(
  input: { code: string; description?: string; type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING"; value: number; minSubtotal: number; maxRedemptions?: number | ""; perUserLimit?: number | ""; endsAt?: string; isActive: boolean },
  actor: AuthUser,
) {
  const data = {
    description: orNull(input.description),
    type: input.type,
    value: input.type === "FIXED" ? Math.round(input.value * 100) : Math.round(input.value),
    minSubtotalCents: Math.round(input.minSubtotal * 100),
    maxRedemptions: input.maxRedemptions === "" || input.maxRedemptions == null ? null : input.maxRedemptions,
    perUserLimit: input.perUserLimit === "" || input.perUserLimit == null ? null : input.perUserLimit,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    isActive: input.isActive,
  };
  const coupon = await db.coupon.upsert({ where: { code: input.code }, update: data, create: { ...data, code: input.code } });
  await audit(actor.id, "coupon.saved", "Coupon", coupon.id, { code: coupon.code });
  return coupon;
}

export async function moderateReview(id: string, status: "APPROVED" | "REJECTED", actor: AuthUser) {
  const review = await db.review.update({ where: { id }, data: { status } });
  const agg = await db.review.aggregate({ where: { productId: review.productId, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } });
  const product = await db.product.update({ where: { id: review.productId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all } });
  await audit(actor.id, `review.${status.toLowerCase()}`, "Review", id);
  await invalidateCatalogCache(product.slug);
}
