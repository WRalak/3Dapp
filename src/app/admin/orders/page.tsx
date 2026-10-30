import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatDate, formatMoney } from "@/lib/utils";
import { ORDER_STATUSES } from "@/lib/validation/admin";
import { PageHeader } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { Pagination, StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; payment?: string; page?: string }> }) {
  await requireAdminPage("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim().slice(0, 80);
  const where: Prisma.OrderWhereInput = {
    ...(sp.status && (ORDER_STATUSES as readonly string[]).includes(sp.status) ? { status: sp.status as "PAID" } : {}),
    ...(sp.payment && ["UNPAID", "PENDING", "PAID", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(sp.payment) ? { paymentStatus: sp.payment as "PAID" } : {}),
    ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { email: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { placedAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { _count: { select: { items: true } } } }),
  ]);
  const href = (p: number) => `/admin/orders?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.payment ? { payment: sp.payment } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Orders" description={`${total} orders`} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Order number, email or name" className="h-10 max-w-xs" aria-label="Search orders" />
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="h-10 w-44" aria-label="Order status">
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="payment" defaultValue={sp.payment ?? ""} className="h-10 w-44" aria-label="Payment status">
          <option value="">Any payment</option>
          {["UNPAID", "PENDING", "PAID", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
      </form>
      <Table>
        <THead>
          <tr>
            <TH>Order</TH>
            <TH>Placed</TH>
            <TH>Customer</TH>
            <TH>Items</TH>
            <TH>Payment</TH>
            <TH>Status</TH>
            <TH className="text-right">Total</TH>
          </tr>
        </THead>
        <tbody>
          {orders.map((o) => (
            <TR key={o.id}>
              <TD>
                <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                  {o.number}
                </Link>
              </TD>
              <TD className="text-xs text-taupe">{formatDate(o.placedAt, { dateStyle: "medium", timeStyle: "short" })}</TD>
              <TD>
                {o.customerName}
                <span className="block text-xs text-taupe">{o.email}</span>
              </TD>
              <TD>{o._count.items}</TD>
              <TD>
                <StatusPill status={o.paymentStatus} />
              </TD>
              <TD>
                <StatusPill status={o.status} />
              </TD>
              <TD className="text-right tabular-nums">{formatMoney(o.totalCents, o.currency)}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / 25))} hrefFor={href} />
    </>
  );
}
