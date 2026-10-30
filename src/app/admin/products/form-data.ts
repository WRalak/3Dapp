import "server-only";
import { db } from "@/lib/db/prisma";
import type { ProductInput } from "@/lib/validation/admin";
import type { getAdminProduct } from "@/server/services/product-admin.service";

/** Form options. With `sellerId`, only that seller's labels/collections (plus shared brands). */
export async function productFormOptions(sellerId?: string) {
  const [brands, categories, collections, sellers] = await Promise.all([
    db.brand.findMany({ where: sellerId ? { OR: [{ sellerId }, { sellerId: null }] } : {}, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ where: sellerId ? { sellerId } : {}, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    sellerId ? Promise.resolve(undefined) : db.seller.findMany({ where: { deletedAt: null, status: { in: ["APPROVED", "PENDING"] } }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
  ]);
  return { brands, categories, collections, sellers: sellers?.map((s) => ({ id: s.id, name: s.businessName })) };
}

const cents = (v: number | null | undefined) => (v == null ? ("" as unknown as number) : v / 100);

export function toFormDefaults(p: NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>): ProductInput {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description,
    brandId: p.brandId,
    categoryId: p.categoryId,
    garmentKind: p.garmentKind,
    price: p.priceCents / 100,
    salePrice: cents(p.salePriceCents),
    saleEndsAt: p.saleEndsAt ? p.saleEndsAt.toISOString().slice(0, 16) : "",
    material: p.material ?? "",
    fabricComposition: p.fabricComposition ?? "",
    careInstructions: p.careInstructions ?? "",
    measurements: p.measurements ? JSON.stringify(p.measurements, null, 2) : "",
    specifications: p.specifications ? JSON.stringify(p.specifications, null, 2) : "",
    tags: p.tags.join(", "),
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
    isFeatured: p.isFeatured,
    status: p.status,
    collectionIds: p.collections.map((c) => c.collectionId),
    sellerId: p.sellerId,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      price: cents(v.priceCents),
      salePrice: cents(v.salePriceCents),
      stock: v.inventory?.quantity ?? 0,
      lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
      isActive: v.isActive,
    })),
  };
}
