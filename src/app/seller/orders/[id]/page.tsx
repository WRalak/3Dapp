import Image from "next/image";
import { notFound } from "next/navigation";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { sellerFulfilAction } from "@/features/marketplace/actions";
import { formatAddress, type AddressSnapshot } from "@/features/delivery/address";
import { etaLabel } from "@/features/delivery/availability";
import { formatDate, formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";

export const metadata = { title: "Order" };

export default async function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { seller } = await requireSellerPage("/seller/orders");
  const { id } = await params;
  // Seller isolation: the query is scoped by sellerId, so another seller's order 404s.
  const so = await db.sellerOrder.findFirst({
    where: { id, sellerId: seller.id },
    include: {
      items: true,
      order: { select: { number: true, customerName: true, phone: true, email: true, shippingAddress: true, notes: true, paidAt: true } },
      shipments: { include: { tracking: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "asc" } },
      commission: true,
    },
  });
  if (!so) notFound();
  const addr = so.order.shippingAddress as AddressSnapshot;
  const paid = so.status !== "PENDING_PAYMENT" && so.status !== "CANCELLED";
  const m = (c: number) => formatMoney(c);

  return (
    <>
      <PageHeader
        title={`Order ${so.order.number}`}
        description={`${so.shippingMethodName} · promised ${etaLabel(so.etaMinDays, so.etaMaxDays).toLowerCase()}`}
        actions={
          <>
            <StatusPill status={so.status} />
            {so.status === "PAID" && (
              <ActionButton size="sm" variant="outline" action={sellerFulfilAction} input={{ sellerOrderId: so.id, status: "PROCESSING" as const }}>
                Start preparing
              </ActionButton>
            )}
            {(so.status === "PAID" || so.status === "PROCESSING") && (
              <FormDialog
                title={so.deliveryType === "PICKUP" ? "Ready for collection" : "Mark as dispatched"}
                trigger={<Button size="sm">{so.deliveryType === "PICKUP" ? "Ready for pickup" : "Dispatch"}</Button>}
                fields={[
                  { name: "carrier", label: "Courier / rider", hint: "e.g. G4S, Fargo, Sendy, own rider" },
                  { name: "trackingNumber", label: "Tracking / waybill no." },
                  { name: "trackingUrl", label: "Tracking link (https)", span: 2 },
                  { name: "note", label: "Note to customer", type: "textarea" },
                ]}
                defaults={{ carrier: "", trackingNumber: "", trackingUrl: "", note: "" }}
                extra={{ sellerOrderId: so.id, status: "SHIPPED" }}
                action={sellerFulfilAction}
                submitLabel="Confirm"
              />
            )}
            {so.status === "SHIPPED" && (
              <ActionButton size="sm" action={sellerFulfilAction} input={{ sellerOrderId: so.id, status: "DELIVERED" as const }} confirm="Confirm the customer has received this order?">
                Mark delivered
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <section className="border bg-surface">
          <ul className="divide-y">
            {so.items.map((i) => (
              <li key={i.id} className="flex gap-4 p-4 text-sm">
                <div className="relative aspect-[3/4] w-14 shrink-0 bg-bone">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="56px" unoptimized={isSvgSource(i.imageUrl)} className="object-cover" />}</div>
                <div className="flex-1">
                  <p className="font-medium">{i.productName}</p>
                  <p className="text-xs text-taupe">
                    {i.variantLabel} · SKU {i.sku}
                  </p>
                </div>
                <p className="tabular-nums">
                  {i.quantity} × {m(i.unitPriceCents)}
                </p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t p-4 text-sm">
            <div className="flex justify-between">
              <dt>Merchandise</dt>
              <dd className="tabular-nums">{m(so.subtotalCents)}</dd>
            </div>
            {so.discountCents > 0 && (
              <div className="flex justify-between">
                <dt>Your promotion</dt>
                <dd className="tabular-nums">{m(-so.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Delivery fee (yours)</dt>
              <dd className="tabular-nums">{m(so.shippingCents)}</dd>
            </div>
            <div className="flex justify-between text-taupe">
              <dt>3Dapp commission{so.commission ? ` (${(so.commission.rateBps / 100).toFixed(1)}%)` : ""}</dt>
              <dd className="tabular-nums">{m(-so.commissionCents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <dt>Your earnings</dt>
              <dd className="tabular-nums">{m(so.sellerNetCents)}</dd>
            </div>
          </dl>
        </section>
        <aside className="space-y-6 text-sm">
          <section className="border bg-surface p-4">
            <h2 className="eyebrow mb-2">{so.deliveryType === "PICKUP" ? "Customer (collecting)" : "Deliver to"}</h2>
            {paid ? (
              <>
                <p className="font-medium">{addr.fullName ?? so.order.customerName}</p>
                <p className="text-graphite">{formatAddress(addr)}</p>
                {addr.directions && <p className="mt-1 text-xs text-taupe">Directions: {addr.directions}</p>}
                <p className="mt-2">
                  <a href={`tel:${addr.phone ?? so.order.phone}`} className="underline underline-offset-4">
                    {addr.phone ?? so.order.phone}
                  </a>
                </p>
                {so.order.notes && <p className="mt-2 text-xs text-taupe">Note: {so.order.notes}</p>}
              </>
            ) : (
              <p className="text-taupe">Customer details appear once payment is confirmed.</p>
            )}
          </section>
          {so.shipments.length > 0 && (
            <section className="border bg-surface p-4">
              <h2 className="eyebrow mb-2">Tracking</h2>
              {so.shipments.map((sh) => (
                <div key={sh.id} className="mb-3">
                  <p>
                    {sh.carrier} {sh.trackingNumber && `· ${sh.trackingNumber}`}
                  </p>
                  <ol className="mt-1 space-y-1 text-xs text-taupe">
                    {sh.tracking.map((t) => (
                      <li key={t.id}>
                        {formatDate(t.occurredAt, { dateStyle: "medium", timeStyle: "short" })} — {t.description}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          )}
          <p className="text-xs text-taupe">Earnings move to your available balance after delivery and the returns window. Problems with this order? Contact seller support — never arrange refunds off-platform.</p>
        </aside>
      </div>
    </>
  );
}
