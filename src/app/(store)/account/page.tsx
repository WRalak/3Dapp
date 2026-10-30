import Link from "next/link";
import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, EmptyState, StatusPill } from "@/components/ui/misc";
import { ORDER_STATUS_LABEL } from "@/features/orders/state-machine";
import { ResendVerification } from "./account-forms";

export default async function AccountOverview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUserPage("/account");
  const sp = await searchParams;
  const [orders, spend, wishlist, activity] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { placedAt: "desc" }, take: 3 }),
    db.order.aggregate({ where: { userId: user.id, status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } }, _sum: { totalCents: true }, _count: { _all: true } }),
    db.wishlistItem.count({ where: { wishlist: { userId: user.id } } }),
    db.loginAttempt.findMany({ where: { email: user.email, success: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const currency = env().STORE_CURRENCY;

  return (
    <div className="space-y-10">
      {sp.welcome && <p className="border border-success/30 bg-success/5 p-4 text-sm text-success">Welcome to Atelier — your account is ready.</p>}
      {!user.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-warning/40 bg-warning/5 p-4 text-sm">
          <span>Please confirm your email address to secure your account.</span>
          <ResendVerification />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total purchases", value: formatMoney(spend._sum.totalCents ?? 0, currency) },
          { label: "Orders", value: String(spend._count._all) },
          { label: "Wishlist", value: String(wishlist) },
        ].map((s) => (
          <Card key={s.label} className="p-6">
            <p className="eyebrow text-taupe">{s.label}</p>
            <p className="mt-3 text-3xl font-medium tracking-tight tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-medium tracking-tight">Recent orders</h2>
          <Link href="/account/orders" className="text-sm underline underline-offset-4">
            All orders
          </Link>
        </div>
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" description="When you place an order it will appear here." />
        ) : (
          <ul className="divide-y border-y">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/account/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm hover:bg-bone/50">
                  <span className="font-medium">{o.number}</span>
                  <span className="text-taupe">{formatDate(o.placedAt)}</span>
                  <StatusPill status={o.status} />
                  <span className="sr-only">{ORDER_STATUS_LABEL[o.status]}</span>
                  <span className="tabular-nums">{formatMoney(o.totalCents, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-medium tracking-tight">Account activity</h2>
        <ul className="divide-y border-y text-sm">
          {activity.map((a) => (
            <li key={a.id} className="flex justify-between gap-4 py-3">
              <span>Signed in{a.reason === "google" ? " with Google" : ""}</span>
              <span className="text-taupe">
                {formatDate(a.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {a.ip}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
