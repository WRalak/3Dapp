import "server-only";
import { db } from "@/lib/db/prisma";
import { notFound } from "@/lib/errors";
import { cardInclude } from "../repositories/product.repository";
import { toCard } from "./catalog.service";

async function wishlistFor(userId: string) {
  return db.wishlist.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function getWishlistProductIds(userId: string) {
  const items = await db.wishlistItem.findMany({ where: { wishlist: { userId } }, select: { productId: true } });
  return items.map((i) => i.productId);
}

export async function getWishlist(userId: string) {
  const items = await db.wishlistItem.findMany({
    where: { wishlist: { userId }, product: { deletedAt: null } },
    include: { product: { include: { ...cardInclude, variants: { ...cardInclude.variants, select: { ...cardInclude.variants.select, id: true, size: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return items.map((i) => ({
    id: i.id,
    addedAt: i.createdAt,
    product: toCard(i.product),
    available: i.product.status === "PUBLISHED",
    variants: i.product.variants.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      available: Math.max(0, (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0)),
    })),
  }));
}

export async function toggleWishlist(userId: string, productId: string) {
  const product = await db.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
  if (!product) throw notFound("Product");
  const wishlist = await wishlistFor(userId);
  const existing = await db.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId } } });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await db.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
  return { saved: true };
}

export async function removeFromWishlist(userId: string, productId: string) {
  await db.wishlistItem.deleteMany({ where: { wishlist: { userId }, productId } });
}
