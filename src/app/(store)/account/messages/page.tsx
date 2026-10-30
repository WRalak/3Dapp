import Link from "next/link";
import { requireUserPage } from "@/lib/auth/guards";
import { listCustomerInquiries } from "@/server/services/community.service";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await requireUserPage("/account/messages");
  const threads = await listCustomerInquiries(user.id);
  if (threads.length === 0) return <EmptyState title="No messages" description="Questions you send to designers from their products or store pages appear here." />;
  return (
    <ul className="divide-y border-y">
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`/account/messages/${t.id}`} className="flex items-center justify-between gap-4 py-4 text-sm hover:bg-bone/50">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.subject}</span>
              <span className="block text-xs text-taupe">
                {t.seller.businessName} · {t._count.messages} message(s)
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-taupe">{formatDate(t.updatedAt, { dateStyle: "medium" })}</span>
              {t.status === "ANSWERED" && <Badge tone="success">Replied</Badge>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
