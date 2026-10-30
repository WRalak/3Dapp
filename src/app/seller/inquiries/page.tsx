import Link from "next/link";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { listSellerInquiries } from "@/server/services/community.service";
import { PageHeader } from "@/components/admin/shell";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function SellerInquiries() {
  const { seller } = await requireSellerPage("/seller/inquiries");
  const threads = await listSellerInquiries(seller.id);
  return (
    <>
      <PageHeader title="Messages" description="Questions from customers about your pieces. Quick replies win sales." />
      <ul className="divide-y border bg-surface">
        {threads.length === 0 && <li className="p-6 text-center text-sm text-taupe">No messages yet.</li>}
        {threads.map((t) => (
          <li key={t.id}>
            <Link href={`/seller/inquiries/${t.id}`} className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-bone/50">
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.subject}</span>
                <span className="block truncate text-xs text-taupe">
                  {t.customer.name ?? "Customer"}
                  {t.product && ` · ${t.product.name}`} · {t._count.messages} message(s)
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-taupe">{formatDate(t.updatedAt, { dateStyle: "medium" })}</span>
                <Badge tone={t.status === "OPEN" ? "warning" : "neutral"}>{t.status === "OPEN" ? "Needs reply" : t.status.toLowerCase()}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
