import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/guards";
import { notFound } from "@/lib/errors";
import { reconcilePayment } from "@/server/services/payment.service";

export const dynamic = "force-dynamic";

/**
 * Polled by the confirmation page (e.g. while waiting for an M-Pesa PIN). Read-only from the
 * client's perspective: it may trigger a server-side provider status query, never a state
 * change based on client input.
 */
export const GET = route(async (_req, { params }: { params: Promise<{ paymentId: string }> }) => {
  const { paymentId } = await params;
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { userId: true, status: true, number: true } } } });
  if (!payment) throw notFound("Payment");
  const user = await getCurrentUser();
  if (payment.order.userId && payment.order.userId !== user?.id) throw notFound("Payment");

  let status = payment.status;
  const stale = !payment.lastCheckedAt || Date.now() - payment.lastCheckedAt.getTime() > 15_000;
  if ((status === "PENDING" || status === "REQUIRES_ACTION") && stale && Date.now() - payment.createdAt.getTime() > 20_000) {
    await reconcilePayment(payment.id).catch(() => undefined);
    status = (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status;
  }
  const order = await db.order.findUniqueOrThrow({ where: { number: payment.order.number }, select: { status: true, paymentStatus: true } });
  return NextResponse.json({ paymentStatus: status, orderStatus: order.status, failureReason: payment.failureReason });
});
