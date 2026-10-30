"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/fetcher";
import { isSvgSource } from "@/lib/media";
import { Price, Skeleton } from "@/components/ui/misc";
import { PurchasePanel } from "@/components/products/purchase-panel";
import type { ProductDetail, ShowroomItem } from "@/types/catalog";
import { ProductFacts } from "./inspect-panel";

/**
 * 2D showroom for devices without WebGL (or when the 3D context fails): a horizontally
 * scrollable rail of editorial images with the same inspection panel.
 */
export function FallbackGallery({ items, currency }: { items: ShowroomItem[]; currency: string }) {
  const [selected, setSelected] = useState<ShowroomItem | null>(null);
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", selected?.slug],
    queryFn: () => api<ProductDetail>(`/api/products/${selected!.slug}`),
    enabled: !!selected,
  });

  return (
    <div className="relative bg-bone" data-testid="showroom-fallback">
      <p className="eyebrow px-4 pt-6 text-taupe md:px-8">The rail · 2D view</p>
      <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 py-6 md:gap-6 md:px-8" aria-label="Garments on the rail">
        {items.map((item) => (
          <li key={item.id} className="w-[62vw] max-w-[300px] shrink-0 snap-center">
            <button type="button" onClick={() => setSelected(item)} className="group block w-full text-left">
              <div className="relative aspect-[3/4] overflow-hidden bg-ivory">
                {item.image && <Image src={item.image} alt={item.name} fill sizes="300px" unoptimized={isSvgSource(item.image)} className="object-cover transition-transform duration-700 group-hover:scale-105" />}
              </div>
              <p className="eyebrow mt-3 text-taupe">{item.brand}</p>
              <p className="text-sm">{item.name}</p>
              <Price cents={item.priceCents} compareAt={item.compareAtCents} currency={currency} className="text-sm text-graphite" />
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" role="dialog" aria-modal="true" aria-label={selected.name} onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-ivory p-6 md:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow text-taupe">{selected.brand}</p>
                <h2 className="mt-2 text-2xl font-medium tracking-tight">{selected.name}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="p-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6">
              {isLoading || !product ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <>
                  <PurchasePanel product={product} currency={currency} compact />
                  <div className="mt-8">
                    <ProductFacts product={product} />
                  </div>
                  <Link href={`/products/${selected.slug}`} className="mt-6 inline-block text-xs uppercase tracking-[0.16em] underline underline-offset-4">
                    View full details
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
