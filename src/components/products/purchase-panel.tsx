"use client";

import { useMemo, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/misc";
import { useAddToCart } from "@/hooks/use-cart";
import { useToggleWishlist, useWishlistIds } from "@/hooks/use-wishlist";
import { subscribeRestockAction } from "@/features/users/actions";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "@/types/catalog";

export function useVariantSelection(product: Pick<ProductDetail, "variants" | "colors" | "sizes">) {
  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [size, setSize] = useState<string | null>(null);
  const forColor = useMemo(() => product.variants.filter((v) => v.color === color), [product.variants, color]);
  const variant = size ? forColor.find((v) => v.size === size) ?? null : null;
  return { color, setColor: (c: string) => (setColor(c), setSize(null)), size, setSize, forColor, variant };
}

export function PurchasePanel({ product, currency, compact }: { product: ProductDetail; currency: string; compact?: boolean }) {
  const sel = useVariantSelection(product);
  const add = useAddToCart();
  const { data: wishlist } = useWishlistIds();
  const toggle = useToggleWishlist();
  const [restockPending, startRestock] = useTransition();
  const saved = wishlist?.ids.includes(product.id) ?? false;
  const price = sel.variant ?? sel.forColor[0];
  const soldOut = sel.variant ? sel.variant.available === 0 : false;

  const onAdd = () => {
    if (!sel.variant) {
      toast("Please choose a size");
      return;
    }
    add.mutate({ variantId: sel.variant.id });
    void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "ADD_TO_CART", productId: product.id }) });
  };

  const onRestock = () =>
    startRestock(async () => {
      if (!sel.variant) return;
      const res = await subscribeRestockAction({ variantId: sel.variant.id });
      if (res.ok) toast.success(res.data.message);
      else toast.error(res.code === "UNAUTHENTICATED" ? "Sign in to get restock alerts" : res.error);
    });

  return (
    <div className="space-y-8">
      <Price cents={price?.priceCents ?? product.priceCents} compareAt={price?.compareAtCents ?? product.compareAtCents} currency={currency} className="text-lg" />

      <fieldset>
        <legend className="eyebrow mb-3 text-graphite">
          Colour — <span className="normal-case tracking-normal text-ink">{sel.color}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => sel.setColor(c.name)}
              aria-pressed={sel.color === c.name}
              aria-label={c.name}
              title={c.name}
              className={cn("size-9 rounded-full border-2 p-0.5 transition", sel.color === c.name ? "border-ink" : "border-transparent hover:border-stone")}
            >
              <span className="block size-full rounded-full border border-ink/10" style={{ backgroundColor: c.hex }} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-3 flex items-baseline justify-between">
          <legend className="eyebrow text-graphite">Size</legend>
          {!compact && (
            <a href="#size-guide" className="text-xs text-taupe underline underline-offset-4">
              Size guide
            </a>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {product.sizes.map((s) => {
            const v = sel.forColor.find((x) => x.size === s);
            const unavailable = !v;
            const out = v?.available === 0;
            return (
              <button
                key={s}
                type="button"
                disabled={unavailable}
                onClick={() => sel.setSize(s)}
                aria-pressed={sel.size === s}
                className={cn(
                  "h-11 border text-sm transition-colors",
                  sel.size === s ? "border-ink bg-ink text-ivory" : "hover:border-ink",
                  out && sel.size !== s && "text-stone line-through",
                  unavailable && "cursor-not-allowed opacity-30",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
        <p className="mt-3 min-h-5 text-xs text-taupe" aria-live="polite">
          {sel.variant ? (sel.variant.available === 0 ? "Sold out in this size" : sel.variant.available <= 3 ? `Only ${sel.variant.available} left` : "In stock — ships in 1–2 days") : ""}
        </p>
      </fieldset>

      <div className="flex gap-2">
        {soldOut ? (
          <Button className="flex-1" size="lg" variant="outline" onClick={onRestock} loading={restockPending}>
            Notify me when available
          </Button>
        ) : (
          <Button className="flex-1" size="lg" onClick={onAdd} loading={add.isPending}>
            Add to bag
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          className="px-4"
          onClick={() => toggle.mutate(product.id)}
          aria-pressed={saved}
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
        >
          <Heart className={cn(saved && "fill-ink")} />
        </Button>
      </div>
    </div>
  );
}
