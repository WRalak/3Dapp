"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { db } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/guards";
import { badRequest, notFound } from "@/lib/errors";
import { requestContext } from "@/lib/security/request";
import { checkoutSchema, PAYMENT_METHODS } from "@/lib/validation/checkout";
import { placeOrder } from "@/server/services/order.service";
import { startPayment } from "@/server/services/payment.service";
import { trackEvent } from "@/server/services/analytics.service";
import { cookies } from "next/headers";
import { readGuestOrders, rememberGuestOrder } from "./guest-orders";

/**
 * Checkout: creates the order (idempotent), then starts payment with the chosen provider.
 * The response tells the client where to go next — it never marks anything as paid.
 */
export const checkoutAction = action(checkoutSchema, async (input) => {
  const user = await getCurrentUser();
  const ctx = await requestContext();
  const order = await placeOrder(input, user, ctx);
  if (!user) await rememberGuestOrder(order.number);
  const vid = (await cookies()).get("atelier_vid")?.value;
  if (vid) await trackEvent("ORDER_PLACED", vid, { userId: user?.id });

  if (order.status !== "PENDING_PAYMENT") return { orderNumber: order.number, redirectTo: `/orders/${order.number}/confirmation` };
  try {
    const next = await startPayment(order.id, input.paymentMethod, { phone: input.mpesaPhone || input.phone });
    return {
      orderNumber: order.number,
      paymentId: next.paymentId,
      redirectTo: next.redirectUrl ?? `/orders/${order.number}/confirmation?payment=${next.paymentId}`,
      instructions: next.instructions,
    };
  } catch {
    // The order exists with stock reserved — send the customer to retry payment.
    return { orderNumber: order.number, redirectTo: `/orders/${order.number}/confirmation?retry=1` };
  }
});

/** Failed-payment recovery: start a fresh payment attempt for an unpaid order. */
export const retryPaymentAction = action(
  z.object({ orderNumber: z.string(), paymentMethod: z.enum(PAYMENT_METHODS), mpesaPhone: z.string().optional() }),
  async ({ orderNumber, paymentMethod, mpesaPhone }) => {
    const user = await getCurrentUser();
    const order = await db.order.findUnique({ where: { number: orderNumber } });
    const guestOk = !order?.userId && order && (await readGuestOrders()).includes(order.number);
    if (!order || (order.userId ? order.userId !== user?.id : !guestOk)) throw notFound("Order");
    if (order.status !== "PENDING_PAYMENT") throw badRequest("This order no longer needs payment");
    const next = await startPayment(order.id, paymentMethod, { phone: mpesaPhone || order.phone });
    return { redirectTo: next.redirectUrl ?? `/orders/${order.number}/confirmation?payment=${next.paymentId}`, instructions: next.instructions };
  },
);
