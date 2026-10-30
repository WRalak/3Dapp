import Link from "next/link";
import Image from "next/image";
import { requireUserPage } from "@/lib/auth/guards";
import { listCustomerOrders } from "@/server/services/order.service";
import { formatDate, formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";
import { EmptyState, StatusPill } from "@/components/ui/misc";

export const metadata = { title: "My orders" };

export default async function OrdersPage() {
  const user = await requireUserPage("/account/orders");
  const orders = await listCustomerOrders(user.id);
  if (orders.length === 0) return <EmptyState title="No orders yet" description="Your order history will appear here." />;
  return (
    <ul className="space-y-4">
      {orders.map((o) => (
        <li key={o.id} className="border bg-surface">
          <Link href={`/account/orders/${o.number}`} className="block p-5 hover:bg-ivory/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{o.number}</p>
                <p className="text-xs text-taupe">Placed {formatDate(o.placedAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={o.status} />
                <StatusPill status={o.paymentStatus} />
                <span className="tabular-nums">{formatMoney(o.totalCents, o.currency)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {o.items.map((i) => (
                <div key={i.id} className="relative aspect-[3/4] w-12 bg-bone">
                  {i.imageUrl && <Image src={i.imageUrl} alt={i.productName} fill sizes="48px" unoptimized={isSvgSource(i.imageUrl)} className="object-cover" />}
                </div>
              ))}
              {o._count.items > 3 && <span className="self-center text-xs text-taupe">+{o._count.items - 3} more</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
