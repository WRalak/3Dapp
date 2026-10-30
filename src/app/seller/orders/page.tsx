import Link from "next/link";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { StatusPill } from "@/components/ui/misc";
import { etaLabel } from "@/features/delivery/availability";
import { formatDate, formatMoney } from "@/lib/utils";
import type { OrderStatus } from "@/generated/prisma/client";

export const metadata = { title: "Orders" };

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "todo", label: "To fulfil", statuses: ["PAID", "PROCESSING"] },
  { key: "shipped", label: "Shipped", statuses: ["SHIPPED"] },
  { key: "done", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "closed", label: "Cancelled / refunded", statuses: ["CANCELLED", "REFUNDED"] },
];

export default async function SellerOrders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { seller } = await requireSellerPage("/seller/orders");
  const { tab = "todo" } = await searchParams;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]!;
  const orders = await db.sellerOrder.findMany({
    where: { sellerId: seller.id, status: { in: current.statuses } },
    orderBy: { createdAt: current.key === "todo" ? "asc" : "desc" },
    take: 100,
    include: { order: { select: { number: true, customerName: true, shippingAddress: true, paidAt: true } }, _count: { select: { items: true } } },
  });
  return (
    <>
      <PageHeader title="Orders" description="You only see your part of each order. Customer payment is held by Mtindo and released to you after delivery." />
      <nav className="mb-4 flex gap-1 border-b text-sm" aria-label="Order status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/seller/orders?tab=${t.key}`} aria-current={t.key === current.key ? "page" : undefined} className={t.key === current.key ? "border-b-2 border-ink px-3 py-2" : "px-3 py-2 text-taupe hover:text-ink"}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Order</th>
              <th className="p-3 font-normal">Deliver to</th>
              <th className="p-3 font-normal">Method</th>
              <th className="p-3 font-normal">Promised</th>
              <th className="p-3 font-normal">Your earnings</th>
              <th className="p-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-taupe">
                  Nothing here.
                </td>
              </tr>
            )}
            {orders.map((so) => {
              const addr = so.order.shippingAddress as { town?: string; county?: string };
              return (
                <tr key={so.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/seller/orders/${so.id}`} className="font-medium underline-offset-4 hover:underline">
                      {so.order.number}
                    </Link>
                    <span className="block text-xs text-taupe">
                      {so._count.items} item(s) · {formatDate(so.order.paidAt ?? so.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </td>
                  <td className="p-3">{[addr.town, addr.county].filter(Boolean).join(", ")}</td>
                  <td className="p-3">{so.shippingMethodName}</td>
                  <td className="p-3">{etaLabel(so.etaMinDays, so.etaMaxDays)}</td>
                  <td className="p-3 tabular-nums">{formatMoney(so.sellerNetCents)}</td>
                  <td className="p-3">
                    <StatusPill status={so.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
