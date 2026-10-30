import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { capturePayPalOrder } from "@/features/payments/providers/paypal";
import { failPayment, fulfilPayment } from "@/server/services/order.service";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Buyer returns from PayPal approval. We capture *server-to-server* using our stored PayPal
 * order id — the browser's query string is only used to look up our own payment record.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId") ?? "";
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment || payment.provider !== "PAYPAL" || !payment.providerReference) return NextResponse.redirect(new URL("/", env().APP_URL));
  const confirmation = new URL(`/orders/${payment.order.number}/confirmation`, env().APP_URL);
  if (payment.status === "SUCCEEDED") return NextResponse.redirect(confirmation);
  try {
    const result = await capturePayPalOrder(payment.providerReference, `capture_${payment.id}`);
    if (result.outcome === "succeeded") {
      await fulfilPayment(payment.id, { amountCents: result.amountCents, currency: result.currency, metadata: { captureId: result.captureId } });
    } else if (result.outcome === "failed") {
      await failPayment(payment.id, "PayPal declined the payment");
    }
  } catch (err) {
    logError(err, { where: "paypal-return", paymentId });
  }
  return NextResponse.redirect(confirmation);
}
