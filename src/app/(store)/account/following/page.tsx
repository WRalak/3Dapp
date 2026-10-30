import Link from "next/link";
import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { FollowButton } from "@/components/marketplace/seller-actions";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Following" };

export default async function FollowingPage() {
  const user = await requireUserPage("/account/following");
  const follows = await db.sellerFollow.findMany({
    where: { userId: user.id, seller: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { id: true, slug: true, businessName: true, town: true, county: { select: { name: true } }, _count: { select: { products: { where: { status: "PUBLISHED", approvalStatus: "APPROVED", deletedAt: null } } } } } } },
  });
  if (follows.length === 0)
    return (
      <EmptyState
        title="You're not following anyone yet"
        description="Follow designers to see them here."
        action={
          <Button asChild>
            <Link href="/designers">Discover designers</Link>
          </Button>
        }
      />
    );
  return (
    <ul className="divide-y border-y">
      {follows.map(({ seller: s }) => (
        <li key={s.id} className="flex items-center justify-between gap-4 py-4 text-sm">
          <Link href={`/designers/${s.slug}`} className="min-w-0">
            <span className="block font-medium">{s.businessName}</span>
            <span className="block text-xs text-taupe">
              {[s.town, s.county?.name].filter(Boolean).join(", ")} · {s._count.products} pieces
            </span>
          </Link>
          <FollowButton sellerId={s.id} following signedIn />
        </li>
      ))}
    </ul>
  );
}
