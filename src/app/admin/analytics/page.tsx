import { requireAdminPage } from "@/lib/auth/guards";
import { env } from "@/config/env";
import { analyticsRangeSchema } from "@/lib/validation/admin";
import { analyticsSummary, customerAcquisition, inventoryPerformance, paymentsByMethod, productPerformance, resolveRange, revenueSeries, salesByCategory, salesByCounty, salesBySeller } from "@/server/services/analytics.service";
import { formatMoney } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { CategoryChart, CountChart, RevenueChart } from "@/components/admin/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireAdminPage("analytics.view");
  const sp = await searchParams;
  const parsed = analyticsRangeSchema.safeParse(sp);
  const range = resolveRange(parsed.success ? parsed.data.from : undefined, parsed.success ? parsed.data.to : undefined, 30);
  const from = range.from.toISOString().slice(0, 10);
  const to = range.to.toISOString().slice(0, 10);
  const currency = env().STORE_CURRENCY;
  const [summary, series, customers, categories, products, inventory, counties, sellers, methods] = await Promise.all([
    analyticsSummary(range),
    revenueSeries(range),
    customerAcquisition(range),
    salesByCategory(range),
    productPerformance(range, 10),
    inventoryPerformance(10),
    salesByCounty(range),
    salesBySeller(range, 15),
    paymentsByMethod(range),
  ]);
  const m = (c: number) => formatMoney(c, currency);
  const csv = (report: string) => `/api/admin/analytics/export?report=${report}&from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${from} → ${to}`}
        actions={
          <form className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              From
              <Input type="date" name="from" defaultValue={from} className="h-9" />
            </label>
            <label className="text-xs">
              To
              <Input type="date" name="to" defaultValue={to} className="h-9" />
            </label>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              Apply
            </Button>
          </form>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Revenue" value={m(summary.revenueCents)} />
        <StatCard label="Paid orders" value={summary.orders.toLocaleString()} />
        <StatCard label="Avg. order value" value={m(summary.averageOrderValueCents)} />
        <StatCard label="Conversion rate" value={`${(summary.conversionRate * 100).toFixed(2)}%`} hint={`${summary.visitors.toLocaleString()} visitors`} />
        <StatCard label="New customers" value={summary.newCustomers.toLocaleString()} />
      </div>

      <section className="mt-8 border bg-surface p-6">
        <div className="mb-4 flex justify-between">
          <h2 className="eyebrow">Revenue over time</h2>
          <a href={csv("revenue")} className="text-xs underline underline-offset-4">CSV</a>
        </div>
        <RevenueChart data={series} currency={currency} />
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section className="border bg-surface p-6">
          <h2 className="eyebrow mb-4">Orders over time</h2>
          <CountChart data={series} dataKey="orders" label="Orders" />
        </section>
        <section className="border bg-surface p-6">
          <div className="mb-4 flex justify-between">
            <h2 className="eyebrow">Customer acquisition</h2>
            <a href={csv("customers")} className="text-xs underline underline-offset-4">CSV</a>
          </div>
          <CountChart data={customers} dataKey="customers" label="New customers" />
        </section>
        <section className="border bg-surface p-6">
          <div className="mb-4 flex justify-between">
            <h2 className="eyebrow">Sales by category</h2>
            <a href={csv("categories")} className="text-xs underline underline-offset-4">CSV</a>
          </div>
          {categories.length ? <CategoryChart data={categories} currency={currency} /> : <p className="text-sm text-taupe">No sales in this period.</p>}
        </section>
        <section>
          <div className="mb-3 flex justify-between">
            <h2 className="eyebrow">Product performance</h2>
            <a href={csv("products")} className="text-xs underline underline-offset-4">CSV</a>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH className="text-right">Views</TH>
                <TH className="text-right">Units</TH>
                <TH className="text-right">Conv.</TH>
                <TH className="text-right">Revenue</TH>
              </tr>
            </THead>
            <tbody>
              {products.map((p) => (
                <TR key={p.productId}>
                  <TD>{p.name}</TD>
                  <TD className="text-right tabular-nums">{p.views}</TD>
                  <TD className="text-right tabular-nums">{p.units}</TD>
                  <TD className="text-right tabular-nums">{(p.conversion * 100).toFixed(1)}%</TD>
                  <TD className="text-right tabular-nums">{m(p.revenueCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex justify-between">
          <h2 className="eyebrow">Inventory performance (last 30 days)</h2>
          <a href={csv("inventory")} className="text-xs underline underline-offset-4">CSV</a>
        </div>
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH className="text-right">On hand</TH>
              <TH className="text-right">Reserved</TH>
              <TH className="text-right">Sold (30d)</TH>
              <TH className="text-right">Days of cover</TH>
            </tr>
          </THead>
          <tbody>
            {inventory.map((r) => (
              <TR key={r.productId}>
                <TD>{r.name}</TD>
                <TD className="text-right tabular-nums">{r.onHand}</TD>
                <TD className="text-right tabular-nums">{r.reserved}</TD>
                <TD className="text-right tabular-nums">{r.sold30}</TD>
                <TD className={`text-right tabular-nums ${r.daysOfCover != null && r.daysOfCover < 14 ? "text-warning" : ""}`}>{r.daysOfCover ?? "—"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </section>
      <div className="mt-8 grid gap-8 xl:grid-cols-3">
        <section>
          <h2 className="eyebrow mb-3">Sales by county</h2>
          <Table>
            <THead>
              <tr>
                <TH>County</TH>
                <TH className="text-right">Orders</TH>
                <TH className="text-right">Revenue</TH>
              </tr>
            </THead>
            <tbody>
              {counties.map((r) => (
                <TR key={r.county}>
                  <TD>{r.county}</TD>
                  <TD className="text-right tabular-nums">{r.orders}</TD>
                  <TD className="text-right tabular-nums">{m(r.revenueCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <h2 className="eyebrow mb-3">Sales by seller</h2>
          <Table>
            <THead>
              <tr>
                <TH>Seller</TH>
                <TH className="text-right">GMV</TH>
                <TH className="text-right">Commission</TH>
              </tr>
            </THead>
            <tbody>
              {sellers.map((r) => (
                <TR key={r.sellerId}>
                  <TD>{r.seller}</TD>
                  <TD className="text-right tabular-nums">{m(r.gmvCents)}</TD>
                  <TD className="text-right tabular-nums">{m(r.commissionCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <h2 className="eyebrow mb-3">Payment methods</h2>
          <Table>
            <THead>
              <tr>
                <TH>Method</TH>
                <TH className="text-right">Success</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Collected</TH>
              </tr>
            </THead>
            <tbody>
              {methods.map((r) => (
                <TR key={r.provider}>
                  <TD>{r.provider === "MPESA" ? "M-Pesa" : r.provider.toLowerCase()}</TD>
                  <TD className="text-right tabular-nums">{r.succeeded}</TD>
                  <TD className="text-right tabular-nums">{r.failed}</TD>
                  <TD className="text-right tabular-nums">{m(r.amountCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </>
  );
}
