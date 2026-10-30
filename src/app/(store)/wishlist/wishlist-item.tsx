"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moveWishlistToCartAction, removeWishlistItemAction } from "@/features/users/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { Price } from "@/components/ui/misc";
import { isSvgSource } from "@/lib/media";
import type { ProductCardData } from "@/types/catalog";

interface Item {
  product: ProductCardData;
  variants: { id: string; size: string; color: string; available: number }[];
  available: boolean;
}

export function WishlistItemCard({ item, currency }: { item: Item; currency: string }) {
  const [variantId, setVariantId] = useState(item.variants.find((v) => v.available > 0)?.id ?? "");
  const [pending, start] = useTransition();
  const qc = useQueryClient();
  const p = item.product;

  const move = () =>
    start(async () => {
      const res = await moveWishlistToCartAction({ productId: p.id, variantId });
      if (res.ok) {
        toast.success(res.data.message);
        await qc.invalidateQueries({ queryKey: ["cart"] });
        await qc.invalidateQueries({ queryKey: ["wishlist-ids"] });
      } else toast.error(res.error);
    });
  const remove = () =>
    start(async () => {
      const res = await removeWishlistItemAction({ productId: p.id });
      if (res.ok) {
        toast.success(res.data.message);
        await qc.invalidateQueries({ queryKey: ["wishlist-ids"] });
      } else toast.error(res.error);
    });

  return (
    <article className={pending ? "opacity-60" : undefined}>
      <Link href={`/products/${p.slug}`} className="relative block aspect-[3/4] overflow-hidden bg-bone">
        {p.image && <Image src={p.image} alt={p.name} fill sizes="(min-width:768px) 25vw, 50vw" unoptimized={isSvgSource(p.image)} className="object-cover" />}
      </Link>
      <p className="eyebrow mt-4 text-taupe">{p.brand}</p>
      <p className="text-sm">{p.name}</p>
      <Price cents={p.priceCents} compareAt={p.compareAtCents} currency={currency} className="text-sm text-graphite" />
      {item.available ? (
        <div className="mt-3 space-y-2">
          <NativeSelect value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-9 text-xs" aria-label={`Size and colour for ${p.name}`}>
            {item.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.available === 0}>
                {v.color} / {v.size}
                {v.available === 0 ? " — sold out" : ""}
              </option>
            ))}
          </NativeSelect>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={move} disabled={!variantId || pending}>
              Move to bag
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between text-xs text-taupe">
          No longer available
          <Button size="sm" variant="ghost" onClick={remove}>
            Remove
          </Button>
        </div>
      )}
    </article>
  );
}
