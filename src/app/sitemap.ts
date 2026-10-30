import type { MetadataRoute } from "next";
import { db } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const [products, collections] = await Promise.all([
    db.product.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticPages = ["", "/shop", "/collections", "/showroom", "/new-arrivals", "/about"].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p ? 0.7 : 1 }));
  return [
    ...staticPages,
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...collections.map((c) => ({ url: `${base}/collections/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
