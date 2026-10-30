import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/prisma";
import { cache, CacheKeys } from "@/lib/cache/redis";
import { unitPrice } from "@/features/orders/pricing";
import { garmentArtwork } from "@/lib/media";
import { PAGE_SIZE } from "@/config/site";
import type { ProductFilter } from "@/lib/validation/catalog";
import type {
  Facets,
  GarmentKindName,
  Paginated,
  ProductCardData,
  ProductDetail,
  ShowroomItem,
} from "@/types/catalog";
import {
  buildOrderBy,
  buildProductWhere,
  cardInclude,
  publishedWhere,
  searchProductIds,
  type CardRow,
} from "../repositories/product.repository";

const NEW_WINDOW_DAYS = 30;
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];

export function sortSizes(sizes: string[]) {
  return [...new Set(sizes)].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function uniqueColors(variants: { color: string; colorHex: string }[]) {
  const seen = new Map<string, string>();
  for (const v of variants) if (!seen.has(v.color)) seen.set(v.color, v.colorHex);
  return [...seen].map(([name, hex]) => ({ name, hex }));
}

export function toCard(p: CardRow, now = new Date()): ProductCardData {
  const prices = p.variants.map((v) => unitPrice(p, v, now));
  const cheapest = prices.length ? prices.reduce((a, b) => (b.priceCents < a.priceCents ? b : a)) : unitPrice(p, null, now);
  const colors = uniqueColors(p.variants);
  const kind = p.garmentKind as GarmentKindName;
  const fallback = garmentArtwork(kind, colors[0]?.hex ?? "#2b2a28");
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand.name,
    category: p.category.name,
    priceCents: cheapest.priceCents,
    compareAtCents: cheapest.compareAtCents,
    image: p.images[0]?.url ?? fallback,
    hoverImage: p.images[1]?.url ?? (p.images[0] ? null : garmentArtwork(kind, colors[0]?.hex ?? "#2b2a28", "back")),
    colors,
    has3d: p.model3D?.status === "READY" && !p.model3D.deletedAt,
    isNew: !!p.publishedAt && now.getTime() - p.publishedAt.getTime() < NEW_WINDOW_DAYS * 86400_000,
    inStock: p.variants.some((v) => (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0) > 0),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    garmentKind: kind,
  };
}

function filterHash(f: ProductFilter) {
  return createHash("sha1").update(JSON.stringify(f)).digest("hex");
}

export async function listProducts(f: ProductFilter, pageSize = PAGE_SIZE): Promise<Paginated<ProductCardData>> {
  return cache.getOrSet(CacheKeys.listing(`${pageSize}:${filterHash(f)}`), 60, async () => {
    const where = buildProductWhere(f);
    if (f.q) {
      const ids = await searchProductIds(f.q);
      where.AND = [...(where.AND as object[]), { id: { in: ids } }];
    }
    const [total, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        include: cardInclude,
        orderBy: buildOrderBy(f.sort),
        skip: (f.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((r) => toCard(r)), total, page: f.page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  });
}

export async function getFacets(): Promise<Facets> {
  return cache.getOrSet(CacheKeys.facets, 300, async () => {
    const [categories, brands, variants, price] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        select: { slug: true, name: true, _count: { select: { products: { where: publishedWhere() } } } },
        orderBy: { sortOrder: "asc" },
      }),
      db.brand.findMany({ where: { products: { some: publishedWhere() } }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
      db.productVariant.findMany({
        where: { deletedAt: null, isActive: true, product: publishedWhere() },
        select: { size: true, color: true, colorHex: true },
        distinct: ["size", "color"],
      }),
      db.product.aggregate({ where: publishedWhere(), _min: { priceCents: true }, _max: { priceCents: true } }),
    ]);
    return {
      categories: categories.map((c) => ({ slug: c.slug, name: c.name, count: c._count.products })),
      brands,
      sizes: sortSizes(variants.map((v) => v.size)),
      colors: uniqueColors(variants).sort((a, b) => a.name.localeCompare(b.name)),
      priceRange: { min: Math.floor((price._min.priceCents ?? 0) / 100), max: Math.ceil((price._max.priceCents ?? 0) / 100) },
    };
  });
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  return cache.getOrSet(CacheKeys.product(slug), 120, async () => {
    const p = await db.product.findFirst({
      where: { slug, ...publishedWhere() },
      include: {
        ...cardInclude,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { deletedAt: null, isActive: true }, include: { inventory: true }, orderBy: [{ color: "asc" }, { size: "asc" }] },
        model3D: true,
      },
    });
    if (!p) return null;
    const card = toCard(p as unknown as CardRow);
    const kind = p.garmentKind as GarmentKindName;
    const primaryHex = p.variants[0]?.colorHex ?? "#2b2a28";
    const variants = p.variants.map((v) => {
      const price = unitPrice(p, v);
      return {
        id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        colorHex: v.colorHex,
        priceCents: price.priceCents,
        compareAtCents: price.compareAtCents,
        available: Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0)),
      };
    });
    const images = p.images.length
      ? p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, kind: i.kind, color: i.color }))
      : [
          { id: "ph-front", url: garmentArtwork(kind, primaryHex, "front"), alt: `${p.name} — front`, kind: "FRONT" as const, color: null },
          { id: "ph-back", url: garmentArtwork(kind, primaryHex, "back"), alt: `${p.name} — back`, kind: "BACK" as const, color: null },
          { id: "ph-detail", url: garmentArtwork(kind, primaryHex, "detail"), alt: `${p.name} — fabric detail`, kind: "FABRIC_DETAIL" as const, color: null },
        ];
    const model = p.model3D && p.model3D.status === "READY" && !p.model3D.deletedAt ? p.model3D : null;
    return {
      ...card,
      description: p.description,
      material: p.material,
      fabricComposition: p.fabricComposition,
      careInstructions: p.careInstructions,
      measurements: (p.measurements as ProductDetail["measurements"]) ?? null,
      specifications: (p.specifications as ProductDetail["specifications"]) ?? null,
      tags: p.tags,
      categorySlug: p.category.slug,
      brandSlug: p.brand.slug,
      images,
      variants,
      sizes: sortSizes(variants.map((v) => v.size)),
      model: model ? { url: model.url, hasDraco: model.hasDraco, hasKtx2: model.hasKtx2, hasMeshopt: model.hasMeshopt, fileSize: model.fileSize } : null,
      totalStock: variants.reduce((s, v) => s + v.available, 0),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
    };
  });
}

export async function getProductCardsByIds(ids: string[]): Promise<ProductCardData[]> {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids.slice(0, 50) }, ...publishedWhere() }, include: cardInclude });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductCardData => !!p);
}

export async function getRelatedProducts(productId: string, take = 4): Promise<ProductCardData[]> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { categoryId: true, brandId: true, tags: true } });
  if (!product) return [];
  const rows = await db.product.findMany({
    where: {
      ...publishedWhere(),
      id: { not: productId },
      OR: [{ categoryId: product.categoryId }, { brandId: product.brandId }, { tags: { hasSome: product.tags } }],
    },
    include: cardInclude,
    orderBy: [{ salesCount: "desc" }],
    take,
  });
  return rows.map((r) => toCard(r));
}

/** "Customers also bought": products co-occurring in paid orders, falling back to related products. */
export async function getRecommendations(productId: string, take = 4): Promise<ProductCardData[]> {
  const rows = await db.$queryRaw<{ productId: string }[]>`
    SELECT oi2."productId" FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi1."orderId" = oi2."orderId" AND oi2."productId" <> oi1."productId"
    JOIN "Order" o ON o.id = oi1."orderId" AND o."paymentStatus" = 'PAID'
    WHERE oi1."productId" = ${productId} AND oi2."productId" IS NOT NULL
    GROUP BY oi2."productId" ORDER BY count(*) DESC LIMIT ${take}`;
  const cards = await getProductCardsByIds(rows.map((r) => r.productId));
  if (cards.length >= take) return cards;
  const related = await getRelatedProducts(productId, take * 2);
  const seen = new Set(cards.map((c) => c.id));
  return [...cards, ...related.filter((r) => !seen.has(r.id))].slice(0, take);
}

async function cardsWhere(where: object, orderBy: object[], take: number) {
  const rows = await db.product.findMany({ where: { ...publishedWhere(), ...where }, include: cardInclude, orderBy, take });
  return rows.map((r) => toCard(r));
}

export async function getHomeData() {
  return cache.getOrSet(CacheKeys.home, 120, async () => {
    const now = new Date();
    const activeWindow = { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] };
    const trendingIds = await db.analyticsEvent.groupBy({
      by: ["productId"],
      where: { type: "PRODUCT_VIEW", productId: { not: null }, createdAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 8,
    });
    const [newArrivals, bestSellers, featured, collections, brands, blocks, trending] = await Promise.all([
      cardsWhere({}, [{ publishedAt: "desc" }], 8),
      cardsWhere({}, [{ salesCount: "desc" }], 8),
      cardsWhere({ isFeatured: true }, [{ updatedAt: "desc" }], 8),
      db.collection.findMany({
        where: { ...activeWindow, isFeatured: true },
        orderBy: { sortOrder: "asc" },
        take: 4,
        include: { _count: { select: { products: true } } },
      }),
      db.brand.findMany({ where: { isFeatured: true }, orderBy: { name: "asc" }, take: 8 }),
      db.contentBlock.findMany({ where: { ...activeWindow, placement: { startsWith: "home." } }, orderBy: { sortOrder: "asc" } }),
      getProductCardsByIds(trendingIds.map((t) => t.productId!).filter(Boolean)),
    ]);
    return {
      newArrivals,
      bestSellers,
      featured,
      trending: trending.length >= 4 ? trending : featured,
      collections: collections.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, heroImageUrl: c.heroImageUrl, count: c._count.products })),
      brands: brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name, description: b.description })),
      blocks: blocks.map((b) => ({
        id: b.id,
        type: b.type,
        placement: b.placement,
        title: b.title,
        subtitle: b.subtitle,
        body: b.body,
        imageUrl: b.imageUrl,
        ctaLabel: b.ctaLabel,
        ctaHref: b.ctaHref,
        data: b.data as Record<string, unknown> | null,
      })),
    };
  });
}

/** Lightweight rail payload — models are referenced by URL and loaded lazily on the client. */
export async function getShowroomItems(opts: { category?: string; collection?: string } = {}): Promise<ShowroomItem[]> {
  const key = `${CacheKeys.showroom}:${opts.category ?? ""}:${opts.collection ?? ""}`;
  return cache.getOrSet(key, 120, async () => {
    const rows = await db.product.findMany({
      where: {
        ...publishedWhere(),
        garmentKind: { notIn: ["SHOES", "BAG", "ACCESSORY"] },
        ...(opts.category ? { OR: [{ category: { slug: opts.category } }, { category: { parent: { slug: opts.category } } }] } : {}),
        ...(opts.collection ? { collections: { some: { collection: { slug: opts.collection } } } } : {}),
      },
      include: { ...cardInclude, model3D: true },
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
      take: 24,
    });
    return rows.map((p) => {
      const card = toCard(p as unknown as CardRow);
      const model = p.model3D && p.model3D.status === "READY" && !p.model3D.deletedAt ? p.model3D : null;
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand.name,
        priceCents: card.priceCents,
        compareAtCents: card.compareAtCents,
        garmentKind: card.garmentKind,
        primaryColor: card.colors[0]?.hex ?? "#2b2a28",
        image: card.image,
        model: model ? { url: model.url, hasDraco: model.hasDraco, hasKtx2: model.hasKtx2, hasMeshopt: model.hasMeshopt, fileSize: model.fileSize } : null,
      };
    });
  });
}

export async function listCollections() {
  const now = new Date();
  return db.collection.findMany({
    where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { products: { where: { product: publishedWhere() } } } } },
  });
}

export async function getCollection(slug: string) {
  return db.collection.findFirst({ where: { slug, isActive: true } });
}

export async function getApprovedReviews(productId: string) {
  return db.review.findMany({
    where: { productId, status: "APPROVED" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function invalidateCatalogCache(slug?: string) {
  await cache.delPrefix(CacheKeys.catalogPrefix);
  if (slug) await cache.del(CacheKeys.product(slug));
}
