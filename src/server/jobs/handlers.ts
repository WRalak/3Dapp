import "server-only";
import { db } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { appUrl, sendEmail } from "@/server/services/email.service";
import { notify } from "@/server/services/notification.service";
import { expireStaleOrders } from "@/server/services/order.service";
import { reconcilePayment } from "@/server/services/payment.service";
import { processModelAsset } from "@/server/services/asset.service";
import type { JobPayloads, JobType } from "./queue";

type Handlers = { [K in JobType]: (payload: JobPayloads[K]) => Promise<void> };

export const handlers: Handlers = {
  async "email.verify"({ userId, token }) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await sendEmail({
      to: user.email,
      subject: "Confirm your email",
      heading: `Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}`,
      paragraphs: ["Confirm your email address to finish setting up your Atelier account. This link expires in 24 hours."],
      cta: { label: "Confirm email", href: appUrl(`/verify-email?token=${token}`) },
    });
  },

  async "email.passwordReset"({ userId, token }) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      heading: "Reset your password",
      paragraphs: ["We received a request to reset your password. This link expires in one hour.", "If you didn't ask for this, you can ignore this email — your password won't change."],
      cta: { label: "Choose a new password", href: appUrl(`/reset-password?token=${token}`) },
    });
  },

  async "email.staffInvite"({ invitationId, token }) {
    const invite = await db.adminInvitation.findUniqueOrThrow({ where: { id: invitationId }, include: { invitedBy: true } });
    await sendEmail({
      to: invite.email,
      subject: "You've been invited to Atelier admin",
      heading: "Join the Atelier team",
      paragraphs: [`${invite.invitedBy.name ?? invite.invitedBy.email} invited you to the Atelier administration dashboard. The invitation expires in 72 hours.`],
      cta: { label: "Accept invitation", href: appUrl(`/invite/${token}`) },
    });
  },

  async "email.orderConfirmation"({ orderId }) {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    await sendEmail({
      to: order.email,
      subject: `Order ${order.number} confirmed`,
      heading: "Thank you for your order",
      paragraphs: [
        `Your order ${order.number} has been confirmed and is being prepared.`,
        ...order.items.map((i) => `${i.quantity} × ${i.productName} (${i.variantLabel}) — ${formatMoney(i.totalCents, order.currency)}`),
        `Total: ${formatMoney(order.totalCents, order.currency)}`,
      ],
      cta: { label: "View order", href: appUrl(`/orders/${order.number}/confirmation`) },
    });
  },

  async "email.orderStatus"({ orderId, status }) {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const shipment = order.shipments[0];
    await sendEmail({
      to: order.email,
      subject: `Order ${order.number}: ${ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status}`,
      heading: `Your order is ${(ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status).toLowerCase()}`,
      paragraphs: [
        `Order ${order.number} has been updated.`,
        ...(shipment?.trackingNumber ? [`Tracking: ${shipment.carrier} ${shipment.trackingNumber}`] : []),
      ],
      cta: { label: "Track order", href: shipment?.trackingUrl ?? appUrl(`/orders/${order.number}/confirmation`) },
    });
  },

  async "email.newSignIn"({ userId, ip, userAgent }) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await sendEmail({
      to: user.email,
      subject: "New sign-in to your Atelier account",
      heading: "Was this you?",
      paragraphs: [`We noticed a sign-in from a new device.`, `IP address: ${ip}`, `Device: ${userAgent.slice(0, 120)}`, "If this wasn't you, reset your password and sign out other sessions immediately."],
      cta: { label: "Review security", href: appUrl("/account/security") },
    });
  },

  async "notify.lowStock"({ variantId }) {
    const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true, inventory: true } });
    if (!v?.inventory) return;
    const available = v.inventory.quantity - v.inventory.reserved;
    if (available > v.inventory.lowStockThreshold) return;
    const staff = await db.user.findMany({
      where: { isStaff: true, status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "inventory.adjust" } } } } } } },
      select: { id: true },
    });
    for (const s of staff) {
      await notify(s.id, "SYSTEM", "Low stock", `${v.product.name} (${v.size}, ${v.color}) has ${available} left.`, `/admin/inventory?q=${encodeURIComponent(v.sku)}`);
    }
  },

  async "notify.restock"({ variantId }) {
    const subs = await db.restockSubscription.findMany({ where: { variantId, notifiedAt: null }, include: { variant: { include: { product: true } } } });
    for (const s of subs) {
      await notify(s.userId, "RESTOCK", "Back in stock", `${s.variant.product.name} in ${s.variant.size} is available again.`, `/products/${s.variant.product.slug}`);
      await db.restockSubscription.update({ where: { id: s.id }, data: { notifiedAt: new Date() } });
    }
  },

  async "orders.expireReservations"() {
    await expireStaleOrders(async (paymentId) => {
      await reconcilePayment(paymentId);
    });
  },

  async "payments.reconcile"({ paymentId }) {
    await reconcilePayment(paymentId);
  },

  async "assets.process"({ assetId }) {
    await processModelAsset(assetId);
  },
};

export async function runJob(type: string, payload: unknown) {
  const handler = handlers[type as JobType] as ((p: unknown) => Promise<void>) | undefined;
  if (!handler) throw new Error(`No handler for job type ${type}`);
  await handler(payload);
}
