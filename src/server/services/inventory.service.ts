import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { AppError, notFound } from "@/lib/errors";
import { enqueue } from "@/server/jobs/queue";
import type { MovementType } from "@/generated/prisma/client";

/**
 * All stock changes go through conditional SQL updates so concurrent checkouts can never
 * oversell: a reservation only succeeds if `quantity - reserved >= qty` at write time.
 * Every change writes an InventoryMovement row for a complete audit trail.
 */

async function movement(tx: Tx, inventoryId: string, type: MovementType, quantity: number, opts: { reason?: string; referenceId?: string; actorId?: string | null }) {
  const inv = await tx.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
  await tx.inventoryMovement.create({
    data: { inventoryId, type, quantity, balance: inv.quantity, reason: opts.reason, referenceId: opts.referenceId, actorId: opts.actorId ?? null },
  });
  return inv;
}

async function inventoryFor(tx: Tx, variantId: string) {
  const inv = await tx.inventory.findUnique({ where: { variantId } });
  if (!inv) throw notFound("Inventory record");
  return inv;
}

export async function reserveStock(tx: Tx, variantId: string, qty: number, orderId: string, label: string) {
  const affected = await tx.$executeRaw`
    UPDATE "Inventory" SET reserved = reserved + ${qty}, "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND quantity - reserved >= ${qty}`;
  if (affected === 0) throw new AppError("OUT_OF_STOCK", `${label} is no longer available in the requested quantity`);
  const inv = await inventoryFor(tx, variantId);
  await movement(tx, inv.id, "RESERVATION", qty, { referenceId: orderId, reason: "Checkout reservation" });
}

export async function releaseStock(tx: Tx, variantId: string, qty: number, orderId: string, reason = "Reservation released") {
  await tx.$executeRaw`
    UPDATE "Inventory" SET reserved = GREATEST(reserved - ${qty}, 0), "updatedAt" = now()
    WHERE "variantId" = ${variantId}`;
  const inv = await inventoryFor(tx, variantId);
  await movement(tx, inv.id, "RELEASE", -qty, { referenceId: orderId, reason });
}

/** Converts a reservation into a sale once payment is confirmed. */
export async function commitSale(tx: Tx, variantId: string, qty: number, orderId: string) {
  const affected = await tx.$executeRaw`
    UPDATE "Inventory" SET quantity = quantity - ${qty}, reserved = GREATEST(reserved - ${qty}, 0), "updatedAt" = now()
    WHERE "variantId" = ${variantId} AND quantity >= ${qty}`;
  if (affected === 0) throw new AppError("OUT_OF_STOCK", "Insufficient stock to fulfil sale");
  const inv = await inventoryFor(tx, variantId);
  await movement(tx, inv.id, "SALE", -qty, { referenceId: orderId, reason: "Order paid" });
  if (inv.quantity - inv.reserved <= inv.lowStockThreshold) await enqueue("notify.lowStock", { variantId }, { tx });
}

export async function returnStock(tx: Tx, variantId: string, qty: number, orderId: string, actorId: string | null, reason: string) {
  const before = await inventoryFor(tx, variantId);
  await tx.inventory.update({ where: { id: before.id }, data: { quantity: { increment: qty } } });
  await movement(tx, before.id, "RETURN", qty, { referenceId: orderId, actorId, reason });
  if (before.quantity - before.reserved <= 0) await enqueue("notify.restock", { variantId }, { tx });
}

/** Manual adjustment by staff (restock, correction, return). */
export async function adjustStock(input: { variantId: string; type: "RESTOCK" | "ADJUSTMENT" | "RETURN"; quantity: number; reason: string }, actorId: string) {
  return db.$transaction(async (tx) => {
    const inv = await tx.inventory.upsert({
      where: { variantId: input.variantId },
      update: {},
      create: { variantId: input.variantId, quantity: 0 },
    });
    const next = inv.quantity + input.quantity;
    if (next < inv.reserved) {
      throw new AppError("VALIDATION", `Stock cannot go below the ${inv.reserved} units reserved by open orders`, { quantity: ["Too large a reduction"] });
    }
    await tx.inventory.update({ where: { id: inv.id }, data: { quantity: next } });
    await movement(tx, inv.id, input.type, input.quantity, { reason: input.reason, actorId });
    const wasOut = inv.quantity - inv.reserved <= 0;
    if (wasOut && next - inv.reserved > 0) await enqueue("notify.restock", { variantId: input.variantId }, { tx });
    if (next - inv.reserved <= inv.lowStockThreshold) await enqueue("notify.lowStock", { variantId: input.variantId }, { tx });
    return { quantity: next, reserved: inv.reserved };
  });
}

export async function setLowStockThreshold(variantId: string, threshold: number) {
  await db.inventory.update({ where: { variantId }, data: { lowStockThreshold: threshold } });
}

export async function lowStockVariants(take = 20) {
  return db.$queryRaw<{ variantId: string; sku: string; size: string; color: string; productName: string; productId: string; available: number; threshold: number }[]>`
    SELECT v.id AS "variantId", v.sku, v.size, v.color, p.name AS "productName", p.id AS "productId",
           (i.quantity - i.reserved)::int AS available, i."lowStockThreshold" AS threshold
    FROM "Inventory" i
    JOIN "ProductVariant" v ON v.id = i."variantId" AND v."deletedAt" IS NULL AND v."isActive"
    JOIN "Product" p ON p.id = v."productId" AND p."deletedAt" IS NULL
    WHERE i.quantity - i.reserved <= i."lowStockThreshold"
    ORDER BY available ASC, p.name ASC
    LIMIT ${take}`;
}
