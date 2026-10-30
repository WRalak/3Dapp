import "server-only";
import { db } from "@/lib/db/prisma";
import { AppError, conflict, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import type { AuthUser } from "@/lib/auth/guards";
import type { ProductOutput } from "@/lib/validation/admin";
import { audit } from "./audit.service";
import { invalidateCatalogCache } from "./catalog.service";
import type { Prisma } from "@/generated/prisma/client";

const toCents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
const orNull = (v: string | null | undefined) => (v ? v : null);

async function uniqueSlug(base: string, excludeId?: string) {
  const root = slugify(base) || "product";
  let candidate = root;
  for (let i = 2; i < 100; i++) {
    const clash = await db.product.findFirst({ where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return candidate;
    candidate = `${root}-${i}`;
  }
  throw conflict("Could not generate a unique slug");
}

function productData(input: ProductOutput) {
  return {
    name: input.name,
    description: input.description,
    brandId: input.brandId,
    categoryId: input.categoryId,
    garmentKind: input.garmentKind,
    priceCents: Math.round(input.price * 100),
    salePriceCents: toCents(input.salePrice),
    saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
    material: orNull(input.material),
    fabricComposition: orNull(input.fabricComposition),
    careInstructions: orNull(input.careInstructions),
    measurements: input.measurements ? (JSON.parse(input.measurements) as Prisma.InputJsonValue) : undefined,
    specifications: input.specifications ? (JSON.parse(input.specifications) as Prisma.InputJsonValue) : undefined,
    tags: (input.tags ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20),
    seoTitle: orNull(input.seoTitle),
    seoDescription: orNull(input.seoDescription),
    isFeatured: input.isFeatured,
    status: input.status,
  };
}

async function assertSkusFree(skus: string[], productId?: string) {
  const clash = await db.productVariant.findFirst({ where: { sku: { in: skus }, ...(productId ? { productId: { not: productId } } : {}) }, select: { sku: true } });
  if (clash) throw new AppError("CONFLICT", `SKU ${clash.sku} is already used by another product`, { variants: [`SKU ${clash.sku} already exists`] });
}

export async function createProduct(input: ProductOutput, actor: AuthUser) {
  if (input.status === "PUBLISHED" && !actor.permissions.includes("products.publish")) input.status = "DRAFT";
  await assertSkusFree(input.variants.map((v) => v.sku));
  const slug = await uniqueSlug(input.slug || input.name);
  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        ...productData(input),
        slug,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        collections: { create: input.collectionIds.map((collectionId, i) => ({ collectionId, sortOrder: i })) },
      },
    });
    for (const v of input.variants) {
      const variant = await tx.productVariant.create({
        data: { productId: p.id, sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex, priceCents: toCents(v.price), salePriceCents: toCents(v.salePrice), isActive: v.isActive },
      });
      const inv = await tx.inventory.create({ data: { variantId: variant.id, quantity: v.stock, lowStockThreshold: v.lowStockThreshold } });
      if (v.stock > 0) {
        await tx.inventoryMovement.create({ data: { inventoryId: inv.id, type: "RESTOCK", quantity: v.stock, balance: v.stock, reason: "Initial stock", actorId: actor.id } });
      }
    }
    return p;
  });
  await audit(actor.id, "product.created", "Product", product.id, { name: product.name });
  await invalidateCatalogCache();
  return product;
}

export async function updateProduct(id: string, input: ProductOutput, actor: AuthUser) {
  const existing = await db.product.findUnique({ where: { id }, include: { variants: { include: { inventory: true } } } });
  if (!existing || existing.deletedAt) throw notFound("Product");
  if (input.status !== existing.status && !actor.permissions.includes("products.publish")) input.status = existing.status;
  await assertSkusFree(input.variants.map((v) => v.sku), id);
  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(input.slug, id) : existing.slug;

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...productData(input),
        slug,
        publishedAt: input.status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      },
    });
    await tx.collectionProduct.deleteMany({ where: { productId: id } });
    if (input.collectionIds.length) {
      await tx.collectionProduct.createMany({ data: input.collectionIds.map((collectionId, i) => ({ collectionId, productId: id, sortOrder: i })) });
    }

    const keep = new Set<string>();
    for (const v of input.variants) {
      const current = v.id ? existing.variants.find((ev) => ev.id === v.id) : undefined;
      const data = { sku: v.sku, size: v.size, color: v.color, colorHex: v.colorHex, priceCents: toCents(v.price), salePriceCents: toCents(v.salePrice), isActive: v.isActive, deletedAt: null };
      if (current) {
        keep.add(current.id);
        await tx.productVariant.update({ where: { id: current.id }, data });
        await tx.inventory.upsert({
          where: { variantId: current.id },
          update: { lowStockThreshold: v.lowStockThreshold },
          create: { variantId: current.id, quantity: v.stock, lowStockThreshold: v.lowStockThreshold },
        });
      } else {
        const created = await tx.productVariant.create({ data: { ...data, productId: id } });
        keep.add(created.id);
        const inv = await tx.inventory.create({ data: { variantId: created.id, quantity: v.stock, lowStockThreshold: v.lowStockThreshold } });
        if (v.stock > 0) await tx.inventoryMovement.create({ data: { inventoryId: inv.id, type: "RESTOCK", quantity: v.stock, balance: v.stock, reason: "Initial stock", actorId: actor.id } });
      }
    }
    // Variants removed from the form are soft-deleted so historical orders keep their references.
    const removed = existing.variants.filter((v) => !keep.has(v.id) && !v.deletedAt);
    for (const v of removed) {
      if ((v.inventory?.reserved ?? 0) > 0) throw new AppError("CONFLICT", `Variant ${v.sku} has stock reserved by open orders and cannot be removed`);
      await tx.productVariant.update({ where: { id: v.id }, data: { deletedAt: new Date(), isActive: false, sku: `${v.sku}-DEL-${Date.now().toString(36)}` } });
    }
  });
  await audit(actor.id, "product.updated", "Product", id, { name: input.name, status: input.status });
  await invalidateCatalogCache(existing.slug);
}

export async function setProductStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", actor: AuthUser) {
  const p = await db.product.findUnique({ where: { id } });
  if (!p || p.deletedAt) throw notFound("Product");
  await db.product.update({ where: { id }, data: { status, publishedAt: status === "PUBLISHED" ? (p.publishedAt ?? new Date()) : p.publishedAt } });
  await audit(actor.id, `product.${status.toLowerCase()}`, "Product", id);
  await invalidateCatalogCache(p.slug);
}

export async function setProductFeatured(id: string, isFeatured: boolean, actor: AuthUser) {
  const p = await db.product.update({ where: { id }, data: { isFeatured } });
  await audit(actor.id, "product.featured", "Product", id, { isFeatured });
  await invalidateCatalogCache(p.slug);
}

/** Soft delete: hidden everywhere, but order history keeps working. */
export async function deleteProduct(id: string, actor: AuthUser) {
  const p = await db.product.findUnique({ where: { id } });
  if (!p || p.deletedAt) throw notFound("Product");
  await db.product.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", isFeatured: false, slug: `${p.slug}-deleted-${Date.now().toString(36)}` } });
  await db.productModel3D.updateMany({ where: { productId: id }, data: { productId: null } });
  await audit(actor.id, "product.deleted", "Product", id, { name: p.name });
  await invalidateCatalogCache(p.slug);
}

export async function listAdminProducts(opts: { q?: string; status?: string; categoryId?: string; page: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(opts.status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(opts.status) ? { status: opts.status as "DRAFT" } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.q
      ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: opts.q.toUpperCase() } } } }] }
      : {}),
  };
  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        model3D: { select: { id: true, status: true } },
        variants: { where: { deletedAt: null }, select: { colorHex: true, inventory: { select: { quantity: true, reserved: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminProduct(id: string) {
  return db.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      variants: { where: { deletedAt: null }, include: { inventory: true }, orderBy: [{ color: "asc" }, { size: "asc" }] },
      images: { orderBy: { sortOrder: "asc" } },
      model3D: true,
      collections: true,
    },
  });
}
