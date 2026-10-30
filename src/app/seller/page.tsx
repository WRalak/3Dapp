import Link from "next/link";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { sellerDashboard, resolveRange } from "@/server/services/analytics.service";
import { sellerEarnings } from "@/server/services/finance.service";
import { db } from "@/lib/db/prisma";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function SellerOverview() {
  const { seller } = await requireSellerPage();
  const range = resolveRange(undefined, undefined, 30);
  const [stats, earnings, recent, zones, inquiries] = await Promise.all([
    sellerDashboard(seller.id, range),
    sellerEarnings(seller.id),
    db.sellerOrder.findMany({ where: { sellerId: seller.id, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "desc" }, take: 8, include: { order: { select: { number: true, customerName: true } }, _count: { select: { items: true } } } }),
    db.deliveryZone.count({ where: { sellerId: seller.id, isActive: true } }),
    db.sellerInquiry.count({ where: { sellerId: seller.id, status: "OPEN" } }),
  ]);
  const todo = [
    zones === 0 && { href: "/seller/delivery", text: "Set up your delivery zones so customers outside pickup range can order" },
    (stats.products.APPROVED ?? 0) + (stats.products.PENDING_REVIEW ?? 0) === 0 && { href: "/seller/products/new", text: "Add your first product" },
    !seller.profile?.payoutMpesaPhone && !seller.profile?.payoutAccountNumberEnc && { href: "/seller/earnings", text: "Add payout details to receive your earnings" },
    inquiries > 0 && { href: "/seller/inquiries", text: `${inquiries} customer message(s) waiting for a reply` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <PageHeader
        title={`Habari, ${seller.businessName}`}
        description="Last 30 days"
        actions={
          <Button asChild>
            <Link href="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      {todo.length > 0 && (
        <ul className="mb-8 space-y-2">
          {todo.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="block border-l-2 border-clay bg-bone/60 px-4 py-3 text-sm hover:bg-bone">
                {t.text} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatMoney(stats.salesCents)} hint={`${stats.orders} orders`} />
        <StatCard label="Your earnings" value={formatMoney(stats.netCents)} hint="After commission, incl. delivery fees" />
        <StatCard label="To fulfil" value={String(stats.toFulfil)} hint="Paid orders awaiting dispatch" />
        <StatCard label="Product views" value={stats.views.toLocaleString("en-KE")} hint={`${stats.lowStock} variant(s) low on stock`} />
        <StatCard label="Available to withdraw" value={formatMoney(earnings.wallet.availableCents)} />
        <StatCard label="Pending" value={formatMoney(earnings.wallet.pendingCents)} hint="Released after delivery + hold period" />
        <StatCard label="Listings live" value={String(stats.products.APPROVED ?? 0)} hint={`${stats.products.PENDING_REVIEW ?? 0} awaiting review · ${stats.products.REJECTED ?? 0} need changes`} />
        <StatCard label="Followers" value={String(seller.followerCount)} />
      </div>
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium">Recent orders</h2>
        <div className="overflow-x-auto border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs text-taupe">
              <tr>
                <th className="p-3 font-normal">Order</th>
                <th className="p-3 font-normal">Customer</th>
                <th className="p-3 font-normal">Delivery</th>
                <th className="p-3 font-normal">Your earnings</th>
                <th className="p-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-taupe">
                    No orders yet.
                  </td>
                </tr>
              )}
              {recent.map((so) => (
                <tr key={so.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/seller/orders/${so.id}`} className="font-medium underline-offset-4 hover:underline">
                      {so.order.number}
                    </Link>
                    <span className="block text-xs text-taupe">{formatDate(so.createdAt, { dateStyle: "medium" })}</span>
                  </td>
                  <td className="p-3">{so.order.customerName}</td>
                  <td className="p-3">{so.shippingMethodName}</td>
                  <td className="p-3 tabular-nums">{formatMoney(so.sellerNetCents)}</td>
                  <td className="p-3">
                    <StatusPill status={so.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
