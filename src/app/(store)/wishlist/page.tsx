import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/guards";
import { getWishlist } from "@/server/services/wishlist.service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { WishlistItemCard } from "./wishlist-item";
import { env } from "@/config/env";

export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="container-luxe pt-14">
        <h1 className="mb-12 text-headline font-medium">Wishlist</h1>
        <EmptyState
          icon={<Heart className="size-8" strokeWidth={1} />}
          title="Sign in to see your wishlist"
          description="Save pieces you love and we'll keep them here across devices."
          action={
            <Button asChild>
              <Link href="/login?next=/wishlist">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const items = await getWishlist(user.id);
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">{items.length} saved</p>
      <h1 className="mb-12 text-headline font-medium">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-8" strokeWidth={1} />}
          title="Nothing saved yet"
          description="Tap the heart on any piece to keep it here."
          action={
            <Button asChild variant="outline">
              <Link href="/shop">Browse the collection</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 xl:grid-cols-4">
          {items.map((i) => (
            <WishlistItemCard key={i.id} item={{ product: i.product, variants: i.variants, available: i.available }} currency={env().STORE_CURRENCY} />
          ))}
        </div>
      )}
    </div>
  );
}
