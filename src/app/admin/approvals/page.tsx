import Link from "next/link";
import Image from "next/image";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/ui/misc";
import { reviewProductAction } from "@/features/marketplace/actions";
import { formatDate, formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";

export const metadata = { title: "Listing approvals" };

/** Moderation queue: seller listings wait here until approved (oldest first). */
export default async function Approvals() {
  await requireAdminPage("products.approve");
  const queue = await db.product.findMany({
    where: { approvalStatus: "PENDING_REVIEW", deletedAt: null },
    orderBy: { updatedAt: "asc" },
    take: 50,
    include: {
      seller: { select: { id: true, businessName: true, status: true } },
      category: { select: { name: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 4 },
      variants: { where: { deletedAt: null }, select: { size: true, color: true } },
      _count: { select: { reports: true } },
    },
  });
  return (
    <>
      <PageHeader title="Listing approvals" description="Check photos are real and match the description, pricing is sensible, and nothing is counterfeit or culturally disrespectful." />
      {queue.length === 0 ? (
        <EmptyState title="Queue is empty" description="New seller listings will appear here." />
      ) : (
        <ul className="space-y-4">
          {queue.map((p) => (
            <li key={p.id} className="grid gap-4 border bg-surface p-4 md:grid-cols-[auto_1fr_auto]">
              <div className="flex gap-1">
                {p.images.length === 0 && <div className="flex size-24 items-center justify-center bg-bone text-center text-[10px] text-taupe">No photos</div>}
                {p.images.map((img) => (
                  <div key={img.id} className="relative size-24 bg-bone">
                    <Image src={img.url} alt={img.alt} fill sizes="96px" unoptimized={isSvgSource(img.url)} className="object-cover" />
                  </div>
                ))}
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  <Link href={`/admin/products/${p.id}`} className="underline-offset-4 hover:underline">
                    {p.name}
                  </Link>{" "}
                  <span className="tabular-nums text-taupe">· {formatMoney(p.salePriceCents ?? p.priceCents)}</span>
                </p>
                <p className="text-xs text-taupe">
                  <Link href={`/admin/sellers/${p.seller.id}`} className="underline underline-offset-4">
                    {p.seller.businessName}
                  </Link>{" "}
                  ({p.seller.status.toLowerCase()}) · {p.category.name} · {[...new Set(p.variants.map((v) => v.color))].join(", ")} · sizes {[...new Set(p.variants.map((v) => v.size))].join(", ")} · updated {formatDate(p.updatedAt, { dateStyle: "medium" })}
                  {p._count.reports > 0 && ` · ${p._count.reports} report(s)`}
                </p>
                <p className="mt-2 line-clamp-3 text-graphite">{p.description}</p>
              </div>
              <div className="flex items-start gap-2">
                <ActionButton size="sm" action={reviewProductAction} input={{ id: p.id, decision: "APPROVED" as const, reason: "" }}>
                  Approve
                </ActionButton>
                <ActionButton size="sm" variant="outline" action={reviewProductAction} input={{ id: p.id, decision: "REJECTED" as const, reason: "" }} prompt={{ label: "What should the seller change?", key: "reason" }}>
                  Reject
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
