import Link from "next/link";
import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { listNotifications } from "@/server/services/notification.service";
import { formatDate } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui/misc";
import { MarkAllRead, NotificationPrefsForm } from "../account-forms";

export const metadata = { title: "Notifications" };

const TYPE_LABEL = { ORDER_UPDATE: "Order", DELIVERY: "Delivery", PROMOTION: "Promotion", RESTOCK: "Restock", SYSTEM: "Account" } as const;

export default async function NotificationsPage() {
  const user = await requireUserPage("/account/notifications");
  const [items, profile] = await Promise.all([listNotifications(user.id), db.customerProfile.findUnique({ where: { userId: user.id } })]);
  return (
    <div className="grid gap-12 xl:grid-cols-[1fr_280px]">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-medium tracking-tight">Inbox</h2>
          {items.some((i) => !i.readAt) && <MarkAllRead />}
        </div>
        {items.length === 0 ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="divide-y border-y">
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "py-4" : "bg-bone/40 py-4 pl-3"}>
                <div className="flex items-center gap-2">
                  <Badge tone={n.readAt ? "outline" : "ink"}>{TYPE_LABEL[n.type]}</Badge>
                  <span className="text-xs text-taupe">{formatDate(n.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{n.title}</p>
                <p className="text-sm text-graphite">{n.body}</p>
                {n.link && (
                  <Link href={n.link} className="mt-1 inline-block text-xs underline underline-offset-4">
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="eyebrow mb-4">Preferences</h2>
        <NotificationPrefsForm
          defaults={{
            notifyOrderUpdates: profile?.notifyOrderUpdates ?? true,
            notifyDelivery: profile?.notifyDelivery ?? true,
            notifyRestock: profile?.notifyRestock ?? true,
            notifyPromotions: profile?.notifyPromotions ?? false,
          }}
        />
      </section>
    </div>
  );
}
