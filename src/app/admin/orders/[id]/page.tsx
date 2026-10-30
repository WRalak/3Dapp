import { formatAddress } from "@/features/delivery/address";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatDate, formatMoney } from "@/lib/utils";
import { ORDER_STATUS_LABEL, ORDER_TRANSITIONS } from "@/features/orders/state-machine";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelOrderAction, markRefundCompleteAction, refundOrderAction, updateOrderStatusAction } from "@/features/admin/actions";

export const metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage("orders.view");
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      user: { select: { id: true, email: true, name: true } },
      statusHistory: { orderBy: { createdAt: "asc" }, include: { actor: { select: { email: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      shipments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();
  const m = (c: number) => formatMoney(c, order.currency);
  const addr = order.shippingAddress as Record<string, string | boolean | undefined>;
  const next = ORDER_TRANSITIONS[order.status].filter((s): s is "PROCESSING" | "SHIPPED" | "DELIVERED" => ["PROCESSING", "SHIPPED", "DELIVERED"].includes(s));
  const refundedCents = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountCents, 0);
  const paid = order.payments.find((p) => ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status));
  const canUpdate = hasPermissions(user, ["orders.update"]);

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        description={`Placed ${formatDate(order.placedAt, { dateStyle: "long", timeStyle: "short" })}`}
        actions={
          <>
            {order.paymentStatus !== "UNPAID" && (
              <Button asChild size="sm" variant="outline">
                <a href={`/api/orders/${order.number}/invoice`} target="_blank" rel="noopener">
                  Invoice
                </a>
              </Button>
            )}
            {canUpdate &&
              next.map((status) => (
                <FormDialog
                  key={status}
                  title={`Mark as ${ORDER_STATUS_LABEL[status].toLowerCase()}`}
                  trigger={<Button size="sm">Mark {ORDER_STATUS_LABEL[status].toLowerCase()}</Button>}
                  action={updateOrderStatusAction}
                  extra={{ orderId: order.id, status }}
                  defaults={{ note: "" }}
                  fields={[
                    ...(status === "SHIPPED"
                      ? [
                          { name: "carrier", label: "Carrier" },
                          { name: "trackingNumber", label: "Tracking number" },
                          { name: "trackingUrl", label: "Tracking URL", span: 2 as const },
                        ]
                      : []),
                    { name: "note", label: "Internal note", type: "textarea" as const },
                  ]}
                  submitLabel="Update order"
                />
              ))}
            {order.status === "PENDING_PAYMENT" && hasPermissions(user, ["orders.cancel"]) && (
              <ActionButton size="sm" variant="danger" action={cancelOrderAction} input={{ orderId: order.id, reason: "" }} prompt={{ label: "Reason for cancelling", key: "reason" }}>
                Cancel order
              </ActionButton>
            )}
            {paid && hasPermissions(user, ["orders.refund"]) && refundedCents < paid.amountCents && (
              <FormDialog
                title="Issue refund"
                trigger={<Button size="sm" variant="outline">Refund</Button>}
                action={refundOrderAction}
                extra={{ orderId: order.id }}
                defaults={{ amount: (paid.amountCents - refundedCents) / 100, reason: "", restock: true }}
                fields={[
                  { name: "amount", label: `Amount (${order.currency})`, type: "number", hint: `Up to ${m(paid.amountCents - refundedCents)}` },
                  { name: "reason", label: "Reason", type: "textarea" },
                  { name: "restock", label: "Return items to stock (full refunds before shipping)", type: "checkbox", span: 2 },
                ]}
                submitLabel="Refund"
              />
            )}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="border bg-surface p-5">
          <p className="eyebrow text-taupe">Status</p>
          <div className="mt-2">
            <StatusPill status={order.status} />
          </div>
        </div>
        <div className="border bg-surface p-5">
          <p className="eyebrow text-taupe">Payment</p>
          <div className="mt-2">
            <StatusPill status={order.paymentStatus} />
          </div>
        </div>
        <div className="border bg-surface p-5">
          <p className="eyebrow text-taupe">Customer</p>
          <p className="mt-2 text-sm">
            {order.user ? (
              <Link href={`/admin/customers/${order.user.id}`} className="underline underline-offset-4">
                {order.customerName}
              </Link>
            ) : (
              `${order.customerName} (guest)`
            )}
          </p>
          <p className="text-xs text-taupe">
            {order.email} · {order.phone}
          </p>
        </div>
        <div className="border bg-surface p-5">
          <p className="eyebrow text-taupe">Total</p>
          <p className="mt-2 text-xl font-medium tabular-nums">{m(order.totalCents)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>SKU</TH>
                <TH>Qty</TH>
                <TH className="text-right">Unit</TH>
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <tbody>
              {order.items.map((i) => (
                <TR key={i.id}>
                  <TD>
                    {i.productName}
                    <span className="block text-xs text-taupe">{i.variantLabel}</span>
                  </TD>
                  <TD className="font-mono text-xs">{i.sku}</TD>
                  <TD>{i.quantity}</TD>
                  <TD className="text-right tabular-nums">{m(i.unitPriceCents)}</TD>
                  <TD className="text-right tabular-nums">{m(i.totalCents)}</TD>
                </TR>
              ))}
              <TR>
                <TD colSpan={4} className="text-right text-taupe">
                  Subtotal · discount{order.couponCode ? ` (${order.couponCode})` : ""} · shipping ({order.shippingMethod}) · tax
                </TD>
                <TD className="text-right text-xs tabular-nums">
                  {m(order.subtotalCents)} · −{m(order.discountCents)} · {m(order.shippingCents)} · {m(order.taxCents)}
                </TD>
              </TR>
            </tbody>
          </Table>

          <section>
            <h2 className="eyebrow mb-3">Payments</h2>
            <Table>
              <THead>
                <tr>
                  <TH>Provider</TH>
                  <TH>Reference</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {order.payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.provider}</TD>
                    <TD className="max-w-[200px] truncate font-mono text-xs">{p.providerReference ?? "—"}</TD>
                    <TD>
                      <StatusPill status={p.status} />
                      {p.failureReason && <span className="block text-xs text-danger">{p.failureReason}</span>}
                    </TD>
                    <TD className="text-xs text-taupe">{formatDate(p.createdAt, { dateStyle: "short", timeStyle: "short" })}</TD>
                    <TD className="text-right tabular-nums">{m(p.amountCents)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </section>

          {order.refunds.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3">Refunds</h2>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Reason</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </tr>
                </THead>
                <tbody>
                  {order.refunds.map((r) => (
                    <TR key={r.id}>
                      <TD className="text-xs">{formatDate(r.createdAt)}</TD>
                      <TD className="text-sm">
                        {r.reason}
                        {r.failureReason && <span className="block text-xs text-taupe">{r.failureReason}</span>}
                      </TD>
                      <TD>
                        <StatusPill status={r.status} />
                        {r.status === "PENDING" && hasPermissions(user, ["orders.refund"]) && (
                          <ActionButton size="sm" variant="link" className="ml-2 text-xs" action={markRefundCompleteAction} input={{ id: r.id }} confirm="Confirm the reversal was completed with the provider?">
                            Mark complete
                          </ActionButton>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">{m(r.amountCents)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </section>
          )}
        </div>

        <aside className="space-y-8">
          <section className="border bg-surface p-5 text-sm">
            <h2 className="eyebrow mb-3">Shipping</h2>
            <p className="leading-relaxed">{addr.pickup ? "Pickup" : [addr.fullName, formatAddress(addr), addr.phone].filter(Boolean).join(", ")}{addr.directions && <span className="block text-taupe">Directions: {addr.directions}</span>}</p>
            {order.shipments.map((s) => (
              <p key={s.id} className="mt-3 text-xs text-taupe">
                {s.carrier} {s.trackingNumber} · {s.status.toLowerCase().replace("_", " ")}
              </p>
            ))}
            {order.notes && <p className="mt-3 border-t pt-3 text-xs">Customer note: {order.notes}</p>}
          </section>
          <section className="border bg-surface p-5">
            <h2 className="eyebrow mb-3">Status history</h2>
            <p className="mb-3 text-xs text-taupe">Immutable — enforced by the database.</p>
            <ol className="space-y-3 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{ORDER_STATUS_LABEL[h.toStatus]}</span>
                  <span className="block text-xs text-taupe">
                    {formatDate(h.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {h.actor?.email ?? "system"}
                    {h.note && ` · ${h.note}`}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
