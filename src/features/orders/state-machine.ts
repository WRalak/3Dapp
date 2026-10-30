import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Allowed order status transitions. Any transition not listed is rejected server-side,
 * which keeps the immutable status history coherent.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "SHIPPED", "CANCELLED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Preparing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

const RANK: Partial<Record<OrderStatus, number>> = { PAID: 1, PROCESSING: 2, SHIPPED: 3, DELIVERED: 4 };

/**
 * A marketplace order's overall status follows its seller sub-orders: it is only "Delivered"
 * once every (non-cancelled) seller has delivered, "Shipped" once all have shipped, etc.
 */
export function parentStatusFrom(subStatuses: OrderStatus[]): OrderStatus | null {
  const active = subStatuses.filter((s) => s !== "CANCELLED" && s !== "REFUNDED");
  if (active.length === 0) return subStatuses.every((s) => s === "REFUNDED") && subStatuses.length ? "REFUNDED" : null;
  if (active.some((s) => s === "PENDING_PAYMENT")) return null;
  const min = Math.min(...active.map((s) => RANK[s] ?? 1));
  const max = Math.max(...active.map((s) => RANK[s] ?? 1));
  if (min === 4) return "DELIVERED";
  if (min === 3) return "SHIPPED";
  return max >= 2 ? "PROCESSING" : "PAID";
}
