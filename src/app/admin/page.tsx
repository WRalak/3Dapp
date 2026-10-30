import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { env } from "@/config/env";
import { bestSellers, getDashboardStats, resolveRange, revenueSeries } from "@/server/services/analytics.service";
import { lowStockVariants } from "@/server/services/inventory.service";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { RevenueChart } from "@/components/admin/charts";
import { StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const denied = sp.denied ? <p className="mb-6 border border-warning/40 bg-warning/5 p-4 text-sm text-warning">You don&apos;t have permission to open that page.</p> : null;
  if (!hasPermissions(user, ["dashboard.view"])) {
    return (
      <>
        {denied}
        <PageHeader title={`Welcome, ${user.name ?? user.email}`} description="Use the menu to reach the areas you manage." />
      </>
    );
  }
  const currency = env().STORE_CURRENCY;
  const [stats, series, lowStock, sellers] = await Promise.all([getDashboardStats(), revenueSeries(resolveRange(undefined, undefined, 30)), lowStockVariants(8), bestSellers(5)]);
  const m = (c: number) => formatMoney(c, currency);

  return (
    <>
      {denied}
      <PageHeader title="Overview" description="Live figures from the order, customer and inventory database." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total revenue" value={m(stats.revenueCents)} hint="Paid orders, all time" />
        <StatCard label="Total orders" value={stats.totalOrders.toLocaleString()} />
        <StatCard label="Customers" value={stats.customers.toLocaleString()} />
        <StatCard label="Products" value={stats.products.toLocaleString()} />
        <StatCard label="Pending orders" value={stats.pending.toLocaleString()} hint="Awaiting payment or fulfilment" />
        <StatCard label="Completed orders" value={stats.completed.toLocaleString()} hint="Delivered" />
        <StatCard label="Low-stock variants" value={lowStock.length.toLocaleString()} />
        <StatCard label="Avg. order (30d)" value={m(Math.round(series.reduce((s, d) => s + d.revenueCents, 0) / Math.max(1, series.reduce((s, d) => s + d.orders, 0))))} />
      </div>

      <section className="mt-8 border bg-surface p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="eyebrow">Revenue · last 30 days</h2>
          {hasPermissions(user, ["analytics.view"]) && (
            <Link href="/admin/analytics" className="text-xs underline underline-offset-4">
              Full analytics
            </Link>
          )}
        </div>
        <RevenueChart data={series} currency={currency} />
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section>
          <h2 className="eyebrow mb-3">Recent transactions</h2>
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Provider</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
              </tr>
            </THead>
            <tbody>
              {stats.recentPayments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.order.number}</TD>
                  <TD>{p.order.customerName}</TD>
                  <TD className="text-xs">{p.provider}</TD>
                  <TD>
                    <StatusPill status={p.status} />
                  </TD>
                  <TD className="text-right tabular-nums">{formatMoney(p.amountCents, p.currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <h2 className="eyebrow mb-3">Low stock</h2>
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Variant</TH>
                <TH className="text-right">Available</TH>
              </tr>
            </THead>
            <tbody>
              {lowStock.length === 0 ? (
                <TR>
                  <TD colSpan={3} className="py-8 text-center text-taupe">
                    All variants are above their thresholds.
                  </TD>
                </TR>
              ) : (
                lowStock.map((v) => (
                  <TR key={v.variantId}>
                    <TD>
                      <Link href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`} className="hover:underline">
                        {v.productName}
                      </Link>
                    </TD>
                    <TD className="text-xs text-taupe">
                      {v.color} / {v.size} · {v.sku}
                    </TD>
                    <TD className={`text-right tabular-nums ${v.available <= 0 ? "text-danger" : "text-warning"}`}>{v.available}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
          <h2 className="eyebrow mb-3 mt-8">Best sellers</h2>
          <ol className="divide-y border bg-surface text-sm">
            {sellers.map((p, i) => (
              <li key={p.id} className="flex justify-between px-4 py-3">
                <span>
                  <span className="mr-3 text-taupe">{i + 1}</span>
                  {p.name}
                </span>
                <span className="tabular-nums text-taupe">{p.salesCount} sold</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="mt-8 text-xs text-taupe">Updated {formatDate(new Date(), { dateStyle: "medium", timeStyle: "short" })} · order status mix: {stats.statusCounts.map((s) => `${s.status.toLowerCase().replace(/_/g, " ")} ${s.count}`).join(" · ")}</p>
    </>
  );
}
