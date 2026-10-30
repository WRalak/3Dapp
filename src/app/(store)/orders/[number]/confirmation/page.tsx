import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { getOrderForViewer } from "@/server/services/order.service";
import { readGuestOrders } from "@/features/orders/guest-orders";
import { enabledPaymentMethods } from "@/features/payments/registry";
import { ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaymentWatcher, RetryPayment } from "./payment-client";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ payment?: string; cancelled?: string; retry?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const order = await getOrderForViewer(number, user, await readGuestOrders());
  if (!order) notFound();

  const latest = order.payments[0];
  const paid = order.paymentStatus === "PAID" || ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status);
  const awaiting = order.status === "PENDING_PAYMENT";
  const failed = awaiting && (order.paymentStatus === "FAILED" || !!sp.cancelled || !!sp.retry);
  const watchPaymentId = awaiting && !failed ? (sp.payment ?? latest?.id) : undefined;
  const m = (c: number) => formatMoney(c, order.currency);

  return (
    <div className="container-luxe max-w-3xl pt-10 md:pt-16">
      <div className="text-center">
        {paid ? <CheckCircle2 className="mx-auto size-10 text-success" strokeWidth={1.25} /> : order.status === "CANCELLED" ? <XCircle className="mx-auto size-10 text-danger" strokeWidth={1.25} /> : <Clock className="mx-auto size-10 text-warning" strokeWidth={1.25} />}
        <p className="eyebrow mt-6 text-taupe">Order {order.number}</p>
        <h1 className="mt-3 text-headline font-medium">
          {paid ? "Thank you — it's confirmed" : order.status === "CANCELLED" ? "This order was cancelled" : failed ? "Payment not completed" : "Waiting for payment"}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-graphite">
          {paid
            ? `A confirmation has been sent to ${order.email}. We'll let you know as soon as it ships.`
            : order.status === "CANCELLED"
              ? "Any reserved stock has been released. You were not charged."
              : failed
                ? "Your items are still reserved. Choose a payment method to try again."
                : "We're confirming your payment with the provider. This page updates automatically."}
        </p>
      </div>

      {watchPaymentId && <PaymentWatcher paymentId={watchPaymentId} />}
      {failed && <RetryPayment orderNumber={order.number} methods={enabledPaymentMethods()} />}

      <div className="mt-12 border bg-surface p-6 md:p-8">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Summary</h2>
          <span className="text-xs text-taupe">{ORDER_STATUS_LABEL[order.status]}</span>
        </div>
        <ul className="mt-4 divide-y text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-3">
              <span>
                {i.productName} <span className="text-taupe">· {i.variantLabel} ×{i.quantity}</span>
              </span>
              <span className="tabular-nums">{m(i.totalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{m(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-clay">
              <dt>Discount</dt>
              <dd>−{m(order.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>{m(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd>{m(order.taxCents)}</dd>
          </div>
          <div className="flex justify-between border-t pt-3 text-base font-medium">
            <dt>Total</dt>
            <dd>{m(order.totalCents)}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {user && (
          <Button asChild variant="outline">
            <Link href={`/account/orders/${order.number}`}>View in my account</Link>
          </Button>
        )}
        <Button asChild>
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
