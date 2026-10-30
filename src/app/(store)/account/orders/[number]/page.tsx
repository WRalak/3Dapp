import { formatAddress } from "@/features/delivery/address";
import { etaLabel } from "@/features/delivery/availability";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireUserPage } from "@/lib/auth/guards";
import { getOrderForViewer } from "@/server/services/order.service";
import { ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { CancelMyOrder } from "../../account-forms";

export default async function OrderDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await requireUserPage(`/account/orders/${number}`);
  const order = await getOrderForViewer(number, user);
  if (!order || order.userId !== user.id) notFound();
  const m = (c: number) => formatMoney(c, order.currency);
  const addr = order.shippingAddress as Record<string, string | boolean | undefined>;
  const shipment = order.shipments[0];
  const payment = order.payments.find((p) => p.status === "SUCCEEDED") ?? order.payments[0];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/account/orders" className="text-xs text-taupe hover:text-ink">
            ← All orders
          </Link>
          <h2 className="mt-2 text-2xl font-medium tracking-tight">Order {order.number}</h2>
          <p className="text-sm text-taupe">Placed {formatDate(order.placedAt, { dateStyle: "long", timeStyle: "short" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.paymentStatus !== "UNPAID" && order.paymentStatus !== "PENDING" && order.paymentStatus !== "FAILED" && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/orders/${order.number}/invoice?download=1`}>
                <Download /> Invoice
              </a>
            </Button>
          )}
          {order.status === "PENDING_PAYMENT" && (
            <>
              <Button asChild size="sm">
                <Link href={`/orders/${order.number}/confirmation?retry=1`}>Complete payment</Link>
              </Button>
              <CancelMyOrder orderId={order.id} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border p-5">
          <p className="eyebrow text-taupe">Order status</p>
          <p className="mt-2">
            <StatusPill status={order.status} />
          </p>
        </div>
        <div className="border p-5">
          <p className="eyebrow text-taupe">Payment</p>
          <p className="mt-2 flex items-center gap-2">
            <StatusPill status={order.paymentStatus} /> <span className="text-xs text-taupe">{payment?.provider}</span>
          </p>
        </div>
        <div className="border p-5">
          <p className="eyebrow text-taupe">Delivery</p>
          {shipment ? (
            <p className="mt-2 text-sm">
              {shipment.carrier} {shipment.trackingNumber}
              {shipment.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">
                  Track
                </a>
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm text-taupe">{order.shippingMethod === "pickup" ? "Pickup" : "Not shipped yet"}</p>
          )}
        </div>
      </div>

      {order.sellerOrders.length > 0 && (
        <section>
          <h3 className="eyebrow mb-4">Deliveries</h3>
          <ul className="space-y-3">
            {order.sellerOrders.map((so) => (
              <li key={so.id} className="border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Link href={`/designers/${so.seller.slug}`} className="font-medium underline-offset-4 hover:underline">
                      {so.seller.businessName}
                    </Link>{" "}
                    <span className="text-taupe">· {so.shippingMethodName} · {etaLabel(so.etaMinDays, so.etaMaxDays).toLowerCase()}</span>
                  </span>
                  <StatusPill status={so.status} />
                </div>
                {so.shipments.map((sh) => (
                  <div key={sh.id} className="mt-2 text-xs text-graphite">
                    {sh.carrier} {sh.trackingNumber}
                    {sh.trackingUrl && (
                      <a href={sh.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-2 underline underline-offset-4">
                        Track
                      </a>
                    )}
                    <ol className="mt-1 space-y-0.5 text-taupe">
                      {sh.tracking.map((t) => (
                        <li key={t.id}>
                          {formatDate(t.occurredAt, { dateStyle: "medium", timeStyle: "short" })} — {t.description}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="eyebrow mb-4">Timeline</h3>
        <ol className="relative space-y-4 border-l pl-6">
          {order.statusHistory.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-ivory bg-ink" aria-hidden />
              <p className="font-medium">{ORDER_STATUS_LABEL[h.toStatus]}</p>
              <p className="text-xs text-taupe">
                {formatDate(h.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                {h.note && ` · ${h.note}`}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-4">Items</h3>
          <ul className="divide-y border-y text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-3">
                <span>
                  {i.productName}
                  <span className="block text-xs text-taupe">
                    {i.variantLabel} · {i.sku} · ×{i.quantity}
                  </span>
                </span>
                <span className="tabular-nums">{m(i.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{m(order.subtotalCents)}</dd></div>
            {order.discountCents > 0 && <div className="flex justify-between text-clay"><dt>Discount</dt><dd>−{m(order.discountCents)}</dd></div>}
            <div className="flex justify-between"><dt>Shipping</dt><dd>{m(order.shippingCents)}</dd></div>
            <div className="flex justify-between"><dt>Tax</dt><dd>{m(order.taxCents)}</dd></div>
            <div className="flex justify-between border-t pt-2 font-medium"><dt>Total</dt><dd>{m(order.totalCents)}</dd></div>
          </dl>
        </div>
        <div>
          <h3 className="eyebrow mb-4">Delivery address</h3>
          <p className="text-sm leading-relaxed text-graphite">
            {addr.pickup ? "Pickup" : [addr.fullName, formatAddress(addr)].filter(Boolean).join(", ")}
          </p>
          {order.refunds.length > 0 && (
            <>
              <h3 className="eyebrow mb-3 mt-8">Refunds</h3>
              <ul className="text-sm">
                {order.refunds.map((r) => (
                  <li key={r.id}>
                    {m(r.amountCents)} — {r.status.toLowerCase()} ({formatDate(r.createdAt)})
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
