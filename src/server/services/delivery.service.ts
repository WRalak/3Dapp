import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/prisma";
import { AppError, notFound } from "@/lib/errors";
import type { SellerContext } from "@/lib/auth/seller-guard";
import type { z } from "zod";
import type { deliveryZoneSchema, shippingMethodSchema } from "@/lib/validation/marketplace";
import { deliveryOptionsFor } from "@/features/delivery/availability";
import { audit } from "./audit.service";

type ZoneInput = z.output<typeof deliveryZoneSchema>;
type MethodInput = z.output<typeof shippingMethodSchema>;

/** The 47 counties rarely change — cached for an hour. */
export const listCounties = unstable_cache(
  async () => db.county.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, slug: true } }),
  ["counties"],
  { revalidate: 3600, tags: ["counties"] },
);

export async function sellerZones(sellerId: string) {
  return db.deliveryZone.findMany({
    where: { sellerId },
    orderBy: { createdAt: "asc" },
    include: { counties: { include: { county: { select: { id: true, name: true } } } }, methods: { orderBy: { priceCents: "asc" } } },
  });
}

const parseTowns = (raw?: string) =>
  [...new Set((raw ?? "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 50);

export async function saveZone(ctx: SellerContext, input: ZoneInput) {
  const valid = await db.county.count({ where: { id: { in: input.countyIds } } });
  if (valid !== input.countyIds.length) throw new AppError("VALIDATION", "Choose valid counties", { countyIds: ["Unknown county"] });
  const data = { name: input.name, towns: parseTowns(input.towns), isActive: input.isActive };
  const zone = await db.$transaction(async (tx) => {
    let z;
    if (input.id) {
      const owned = await tx.deliveryZone.findFirst({ where: { id: input.id, sellerId: ctx.seller.id } });
      if (!owned) throw notFound("Delivery zone");
      z = await tx.deliveryZone.update({ where: { id: owned.id }, data });
      await tx.deliveryZoneCounty.deleteMany({ where: { zoneId: owned.id } });
    } else {
      if ((await tx.deliveryZone.count({ where: { sellerId: ctx.seller.id } })) >= 30) throw new AppError("VALIDATION", "You can have up to 30 delivery zones");
      z = await tx.deliveryZone.create({ data: { ...data, sellerId: ctx.seller.id } });
    }
    await tx.deliveryZoneCounty.createMany({ data: input.countyIds.map((countyId) => ({ zoneId: z.id, countyId })) });
    return z;
  });
  await audit(ctx.user.id, input.id ? "delivery.zone_updated" : "delivery.zone_created", "DeliveryZone", zone.id, { counties: input.countyIds.length });
  return zone;
}

export async function deleteZone(ctx: SellerContext, zoneId: string) {
  const owned = await db.deliveryZone.findFirst({ where: { id: zoneId, sellerId: ctx.seller.id } });
  if (!owned) throw notFound("Delivery zone");
  await db.deliveryZone.delete({ where: { id: owned.id } });
  await audit(ctx.user.id, "delivery.zone_deleted", "DeliveryZone", owned.id);
}

export async function saveMethod(ctx: SellerContext, input: MethodInput) {
  const zone = await db.deliveryZone.findFirst({ where: { id: input.zoneId, sellerId: ctx.seller.id } });
  if (!zone) throw notFound("Delivery zone");
  const data = {
    zoneId: zone.id,
    type: input.type,
    name: input.name,
    priceCents: Math.round(input.price * 100),
    freeOverCents: input.freeOver === "" || input.freeOver == null ? null : Math.round(input.freeOver * 100),
    minDays: input.type === "SAME_DAY" ? 0 : input.minDays,
    maxDays: input.type === "SAME_DAY" ? Math.max(0, input.maxDays) : input.maxDays,
    cutoffHour: input.cutoffHour === "" || input.cutoffHour == null ? null : input.cutoffHour,
    pickupAddress: input.type === "PICKUP" ? input.pickupAddress || null : null,
    isActive: input.isActive,
  };
  let method;
  if (input.id) {
    const owned = await db.shippingMethod.findFirst({ where: { id: input.id, zone: { sellerId: ctx.seller.id } } });
    if (!owned) throw notFound("Delivery method");
    method = await db.shippingMethod.update({ where: { id: owned.id }, data });
  } else {
    method = await db.shippingMethod.create({ data });
  }
  await audit(ctx.user.id, input.id ? "delivery.method_updated" : "delivery.method_created", "ShippingMethod", method.id, { type: method.type, priceCents: method.priceCents });
  return method;
}

export async function deleteMethod(ctx: SellerContext, methodId: string) {
  const owned = await db.shippingMethod.findFirst({ where: { id: methodId, zone: { sellerId: ctx.seller.id } } });
  if (!owned) throw notFound("Delivery method");
  // Historical seller orders keep their snapshot (name/type/ETA) — the FK is SET NULL.
  await db.shippingMethod.delete({ where: { id: owned.id } });
  await audit(ctx.user.id, "delivery.method_deleted", "ShippingMethod", owned.id);
}

/** Delivery options a seller offers to a county/town — used on product pages and the 3D panel. */
export async function deliveryOptionsForSeller(sellerId: string, countyId: string | null, town: string | null, merchandiseCents: number) {
  const zones = await db.deliveryZone.findMany({ where: { sellerId, isActive: true }, include: { counties: { select: { countyId: true } }, methods: { where: { isActive: true } } } });
  return deliveryOptionsFor(
    zones.map((z) => ({ id: z.id, isActive: z.isActive, towns: z.towns, countyIds: z.counties.map((c) => c.countyId), methods: z.methods })),
    countyId,
    town,
    merchandiseCents,
  );
}

/** Counties a seller delivers to (for "Delivers to N counties" badges). */
export async function sellerCoverage(sellerId: string) {
  const rows = await db.deliveryZoneCounty.findMany({ where: { zone: { sellerId, isActive: true, methods: { some: { isActive: true, type: { not: "PICKUP" } } } } }, select: { county: { select: { id: true, name: true } } }, distinct: ["countyId"] });
  return rows.map((r) => r.county);
}
