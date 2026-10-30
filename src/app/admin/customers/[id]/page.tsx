import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { getCustomer } from "@/server/services/admin.service";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { setCustomerStatusAction } from "@/features/admin/actions";
import { env } from "@/config/env";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage("customers.view");
  const c = await getCustomer((await params).id);
  if (!c) notFound();
  const currency = env().STORE_CURRENCY;
  const paidOrders = c.orders.filter((o) => ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status));
  const ltv = paidOrders.reduce((s, o) => s + o.totalCents, 0);
  return (
    <>
      <PageHeader
        title={c.name ?? c.email}
        description={`${c.email} · joined ${formatDate(c.createdAt)}`}
        actions={
          hasPermissions(user, ["customers.manage"]) &&
          (c.status === "SUSPENDED" ? (
            <ActionButton action={setCustomerStatusAction} input={{ id: c.id, status: "ACTIVE" as const, reason: "" }} prompt={{ label: "Reason for reactivating", key: "reason" }}>
              Reactivate account
            </ActionButton>
          ) : (
            <ActionButton variant="danger" action={setCustomerStatusAction} input={{ id: c.id, status: "SUSPENDED" as const, reason: "" }} prompt={{ label: "Reason for suspending (signs the customer out everywhere)", key: "reason" }}>
              Suspend account
            </ActionButton>
          ))
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Status" value={c.status.toLowerCase()} />
        <StatCard label="Orders" value={String(c.orders.length)} />
        <StatCard label="Lifetime value" value={formatMoney(ltv, currency)} />
        <StatCard label="Active sessions" value={String(c.sessions.length)} />
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
        <section>
          <h2 className="eyebrow mb-3">Purchase history</h2>
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <tbody>
              {c.orders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                      {o.number}
                    </Link>
                  </TD>
                  <TD className="text-xs">{formatDate(o.placedAt)}</TD>
                  <TD>
                    <StatusPill status={o.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{formatMoney(o.totalCents, o.currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
        <aside className="space-y-6 text-sm">
          <section className="border bg-surface p-5">
            <h2 className="eyebrow mb-3">Profile</h2>
            <p>Phone: {c.profile?.phone ?? "—"}</p>
            <p>Email verified: {c.emailVerifiedAt ? formatDate(c.emailVerifiedAt) : "no"}</p>
            <p>Last sign-in: {c.lastLoginAt ? `${formatDate(c.lastLoginAt)} (${c.lastLoginIp})` : "—"}</p>
          </section>
          <section className="border bg-surface p-5">
            <h2 className="eyebrow mb-3">Addresses</h2>
            {c.addresses.length === 0 ? <p className="text-taupe">None saved</p> : c.addresses.map((a) => <p key={a.id} className="mb-2">{a.line1}, {a.city}, {a.country}{a.isDefault && " (default)"}</p>)}
          </section>
          <section className="border bg-surface p-5">
            <h2 className="eyebrow mb-3">Recent reviews</h2>
            {c.reviews.length === 0 ? <p className="text-taupe">None</p> : c.reviews.map((r) => <p key={r.id} className="mb-2">{r.rating}★ {r.product.name} <StatusPill status={r.status} /></p>)}
          </section>
        </aside>
      </div>
    </>
  );
}
