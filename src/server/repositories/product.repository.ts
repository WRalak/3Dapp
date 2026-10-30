import "server-only";
import { db } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { ProductFilter } from "@/lib/validation/catalog";

/** Shared Prisma include for anything rendered as a product card. */
export const cardInclude = {
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  images: { orderBy: { sortOrder: "asc" }, take: 2, select: { url: true, alt: true } },
  variants: {
    where: { deletedAt: null, isActive: true },
    select: { color: true, colorHex: true, priceCents: true, salePriceCents: true, inventory: { select: { quantity: true, reserved: true } } },
  },
  model3D: { select: { status: true, deletedAt: true } },
} satisfies Prisma.ProductInclude;

export type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export const publishedWhere = (): Prisma.ProductWhereInput => ({ status: "PUBLISHED", deletedAt: null });

/** Full-text search with ranking; falls back to substring match for short/partial terms. */
export async function searchProductIds(q: string, limit = 500): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Product"
    WHERE "deletedAt" IS NULL AND status = 'PUBLISHED'
      AND (
        product_search_document("name", "description", "tags") @@ websearch_to_tsquery('english', ${q})
        OR "name" ILIKE ${"%" + q.replace(/[%_\\]/g, (c) => "\\" + c) + "%"}
      )
    ORDER BY ts_rank(product_search_document("name", "description", "tags"), websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export function buildProductWhere(f: ProductFilter, now = new Date()): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [publishedWhere()];
  if (f.category) and.push({ OR: [{ category: { slug: f.category } }, { category: { parent: { slug: f.category } } }] });
  if (f.collection) and.push({ collections: { some: { collection: { slug: f.collection } } } });
  if (f.brand.length) and.push({ brand: { slug: { in: f.brand } } });
  if (f.size.length || f.color.length) {
    and.push({
      variants: {
        some: {
          deletedAt: null,
          isActive: true,
          ...(f.size.length ? { size: { in: f.size } } : {}),
          ...(f.color.length ? { color: { in: f.color, mode: "insensitive" } } : {}),
        },
      },
    });
  }
  if (f.minPrice != null || f.maxPrice != null) {
    const range = { ...(f.minPrice != null ? { gte: f.minPrice * 100 } : {}), ...(f.maxPrice != null ? { lte: f.maxPrice * 100 } : {}) };
    and.push({
      OR: [
        { salePriceCents: null, priceCents: range },
        { salePriceCents: range, OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: now } }] },
        { salePriceCents: { not: null }, saleEndsAt: { lte: now }, priceCents: range },
      ],
    });
  }
  if (f.onSale) and.push({ salePriceCents: { not: null }, OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: now } }] });
  if (f.has3d) and.push({ model3D: { status: "READY", deletedAt: null } });
  return { AND: and };
}

export function buildOrderBy(sort: ProductFilter["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ publishedAt: "desc" }, { createdAt: "desc" }];
    case "price-asc":
      return [{ priceCents: "asc" }];
    case "price-desc":
      return [{ priceCents: "desc" }];
    case "best-selling":
      return [{ salesCount: "desc" }];
    case "rating":
      return [{ ratingAvg: "desc" }, { ratingCount: "desc" }];
    default:
      return [{ isFeatured: "desc" }, { salesCount: "desc" }, { createdAt: "desc" }];
  }
}
