import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { listCustomers } from "@/server/services/admin.service";
import { env } from "@/config/env";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { Pagination, StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireAdminPage("customers.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, pageCount } = await listCustomers({ q: sp.q?.slice(0, 80), status: sp.status, page });
  const currency = env().STORE_CURRENCY;
  return (
    <>
      <PageHeader title="Customers" description={`${total} customers`} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Name or email" className="h-10 max-w-xs" aria-label="Search customers" />
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="h-10 w-40" aria-label="Status">
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </NativeSelect>
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
      </form>
      <Table>
        <THead>
          <tr>
            <TH>Customer</TH>
            <TH>Joined</TH>
            <TH>Last sign-in</TH>
            <TH>Orders</TH>
            <TH>Lifetime value</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {items.map((c) => (
            <TR key={c.id}>
              <TD>
                <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                  {c.name ?? "—"}
                </Link>
                <span className="block text-xs text-taupe">
                  {c.email} {c.emailVerifiedAt ? "" : "· unverified"}
                </span>
              </TD>
              <TD className="text-xs">{formatDate(c.createdAt)}</TD>
              <TD className="text-xs">{c.lastLoginAt ? formatDate(c.lastLoginAt) : "—"}</TD>
              <TD>{c._count.orders}</TD>
              <TD className="tabular-nums">{formatMoney(c.lifetimeCents, currency)}</TD>
              <TD>
                <StatusPill status={c.status} />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={pageCount} hrefFor={(p) => `/admin/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(p) })}`} />
    </>
  );
}
