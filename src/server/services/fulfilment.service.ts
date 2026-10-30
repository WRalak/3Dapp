import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { badRequest, notFound } from "@/lib/errors";
import { canTransition, ORDER_STATUS_LABEL, parentStatusFrom } from "@/features/orders/state-machine";
import { getShippingProvider } from "@/features/delivery/providers";
import { enqueue } from "@/server/jobs/queue";
import type { AuthUser } from "@/lib/auth/guards";
import type { ShipmentStatus } from "@/generated/prisma/client";
import { appendStatus } from "./order.service";
import { notify } from "./notification.service";
import { audit } from "./audit.service";

export interface FulfilmentInput {
  sellerOrderId: string;
  status: "PROCESSING" | "SHIPPED" | "DELIVERED";
  note?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

/** Re-derives the parent order's status from its seller orders and records the change. */
export async function syncParentStatus(tx: Tx, orderId: string, actorId: string | null) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { sellerOrders: { select: { status: true } } } });
  const next = parentStatusFrom(order.sellerOrders.map((s) => s.status));
  if (!next || next === order.status || !canTransition(order.status, next)) return order.status;
  await tx.order.update({ where: { id: orderId }, data: { status: next } });
  await appendStatus(tx, orderId, order.status, next, actorId, next === "DELIVERED" ? "All deliveries completed" : undefined);
  return next;
}

/**
 * Moves one seller's part of an order forward. `scope` = the acting seller (sellers may only
 * touch their own seller orders); staff with orders.fulfil pass no scope.
 */
export async function updateSellerOrderStatus(input: FulfilmentInput, actor: AuthUser, scope?: { sellerId: string }) {
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SellerOrder" WHERE id = ${input.sellerOrderId} FOR UPDATE`;
    const so = await tx.sellerOrder.findUnique({ where: { id: input.sellerOrderId }, include: { order: true, seller: { select: { businessName: true } }, shippingMethod: true } });
    if (!so || (scope && so.sellerId !== scope.sellerId)) throw notFound("Order");
    if (!canTransition(so.status, input.status)) throw badRequest(`Cannot move this order from ${ORDER_STATUS_LABEL[so.status]} to ${ORDER_STATUS_LABEL[input.status]}`);
    const now = new Date();
    await tx.sellerOrder.update({
      where: { id: so.id },
      data: { status: input.status, ...(input.status === "SHIPPED" ? { shippedAt: now } : {}), ...(input.status === "DELIVERED" ? { deliveredAt: now, ...(so.shippedAt ? {} : { shippedAt: now }) } : {}) },
    });

    let shipmentStatus: ShipmentStatus | null = null;
    if (input.status === "SHIPPED" || (input.status === "DELIVERED" && so.status !== "SHIPPED")) {
      const provider = getShippingProvider(so.shippingMethod?.provider ?? "manual");
      const booked = await provider.createShipment({ sellerOrderId: so.id, carrier: input.carrier, trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl });
      shipmentStatus = input.status === "DELIVERED" ? "DELIVERED" : so.deliveryType === "PICKUP" ? "OUT_FOR_DELIVERY" : "IN_TRANSIT";
      await tx.shipment.create({
        data: {
          orderId: so.orderId,
          sellerOrderId: so.id,
          provider: provider.id,
          carrier: booked.carrier,
          trackingNumber: booked.trackingNumber,
          trackingUrl: booked.trackingUrl,
          status: shipmentStatus,
          shippedAt: now,
          deliveredAt: input.status === "DELIVERED" ? now : null,
          tracking: { create: { status: shipmentStatus, description: so.deliveryType === "PICKUP" ? "Ready for collection" : `Dispatched by ${so.seller.businessName}` } },
        },
      });
    } else if (input.status === "DELIVERED") {
      const shipments = await tx.shipment.findMany({ where: { sellerOrderId: so.id, status: { notIn: ["DELIVERED", "RETURNED"] } } });
      for (const sh of shipments) {
        await tx.shipment.update({ where: { id: sh.id }, data: { status: "DELIVERED", deliveredAt: now } });
        await tx.shipmentTracking.create({ data: { shipmentId: sh.id, status: "DELIVERED", description: input.note || "Delivered" } });
      }
    }

    const parent = await syncParentStatus(tx, so.orderId, actor.id);
    if (so.order.userId) {
      const label = so.deliveryType === "PICKUP" && input.status === "SHIPPED" ? "ready for collection" : ORDER_STATUS_LABEL[input.status].toLowerCase();
      await notify(
        so.order.userId,
        input.status === "PROCESSING" ? "ORDER_UPDATE" : "DELIVERY",
        `${so.seller.businessName}: ${label}`,
        `Your items from ${so.seller.businessName} (order ${so.order.number}) are ${label}.`,
        `/account/orders/${so.order.number}`,
        tx,
      );
    }
    await enqueue("email.orderStatus", { orderId: so.orderId, status: input.status }, { tx });
    return { so, parent };
  });
  await audit(actor.id, "seller_order.status_updated", "SellerOrder", input.sellerOrderId, { to: input.status, orderId: result.so.orderId, tracking: input.trackingNumber, parent: result.parent });
  return result;
}

/** Customer/staff-visible tracking timeline for an order (all sellers). */
export async function trackingFor(orderId: string) {
  return db.shipment.findMany({ where: { orderId }, include: { tracking: { orderBy: { occurredAt: "asc" } }, sellerOrder: { select: { seller: { select: { businessName: true } } } } }, orderBy: { createdAt: "asc" } });
}
