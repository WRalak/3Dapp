import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/client";

const PREF_FOR: Partial<Record<NotificationType, "notifyOrderUpdates" | "notifyPromotions" | "notifyRestock" | "notifyDelivery">> = {
  ORDER_UPDATE: "notifyOrderUpdates",
  PROMOTION: "notifyPromotions",
  RESTOCK: "notifyRestock",
  DELIVERY: "notifyDelivery",
};

/** Creates an in-app notification, honouring the customer's preferences. */
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
  tx?: Tx,
) {
  const client = tx ?? db;
  const pref = PREF_FOR[type];
  if (pref) {
    const profile = await client.customerProfile.findUnique({ where: { userId }, select: { [pref]: true } });
    if (profile && (profile as Record<string, boolean>)[pref] === false) return null;
  }
  return client.notification.create({ data: { userId, type, title, body, link } });
}

export async function listNotifications(userId: string, take = 50) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markRead(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
}
