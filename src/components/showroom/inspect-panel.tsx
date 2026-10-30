"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "@/lib/fetcher";
import { isSvgSource } from "@/lib/media";
import { useShowroomStore } from "@/stores/showroom-store";
import { PurchasePanel } from "@/components/products/purchase-panel";
import { Skeleton } from "@/components/ui/misc";
import { DeliveryCheck } from "@/components/marketplace/delivery-check";
import { RepresentationNotice } from "@/components/marketplace/seller-card";
import type { ProductDetail, ShowroomItem } from "@/types/catalog";

export function InspectControls({ onReturn }: { onReturn?: () => void }) {
  const s = useShowroomStore.getState;
  const btn = "flex size-10 items-center justify-center border border-ink/15 bg-ivory/90 text-ink hover:bg-ivory";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="3D inspection controls">
      {onReturn && (
        <button type="button" onClick={onReturn} className="mr-2 inline-flex h-10 items-center gap-2 bg-ink px-4 text-xs uppercase tracking-[0.16em] text-ivory">
          <ArrowLeft className="size-4" /> Back to rail
        </button>
      )}
      <button type="button" className={btn} aria-label="Rotate left" onClick={() => s().rotateBy(-Math.PI / 4)}>
        <RotateCcw className="size-4" />
      </button>
      <button type="button" className={btn} aria-label="Rotate right" onClick={() => s().rotateBy(Math.PI / 4)}>
        <RotateCw className="size-4" />
      </button>
      <button type="button" className={btn} aria-label="Zoom in" onClick={() => s().zoomBy(-0.4)}>
        <ZoomIn className="size-4" />
      </button>
      <button type="button" className={btn} aria-label="Zoom out" onClick={() => s().zoomBy(0.4)}>
        <ZoomOut className="size-4" />
      </button>
      <div className="ml-1 flex border border-ink/15 bg-ivory/90 text-[11px] uppercase tracking-[0.14em]">
        {(["front", "side", "back"] as const).map((v) => (
          <button key={v} type="button" onClick={() => s().setView(v)} className="h-10 px-3 hover:bg-bone">
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t py-4">
      <dt className="eyebrow mb-2 text-taupe">{label}</dt>
      <dd className="text-sm leading-relaxed text-graphite">{children}</dd>
    </div>
  );
}

export function ProductFacts({ product }: { product: ProductDetail }) {
  const fabric = product.images.filter((i) => i.kind === "FABRIC_DETAIL");
  return (
    <dl>
      <Detail label="Description">{product.description}</Detail>
      {product.material && <Detail label="Material">{product.material}</Detail>}
      {product.fabricComposition && <Detail label="Composition">{product.fabricComposition}</Detail>}
      <Detail label="Availability">{product.totalStock > 0 ? `${product.totalStock} in stock across sizes` : "Currently sold out"}</Detail>
      {product.measurements && (
        <Detail label="Measurements (cm)">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="py-1 font-medium">Size</th>
                {Object.keys(Object.values(product.measurements)[0] ?? {}).map((k) => (
                  <th key={k} className="py-1 font-medium capitalize">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(product.measurements).map(([size, m]) => (
                <tr key={size} className="border-t">
                  <td className="py-1">{size}</td>
                  {Object.values(m).map((v, i) => (
                    <td key={i} className="py-1 tabular-nums">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Detail>
      )}
      {product.careInstructions && <Detail label="Care">{product.careInstructions}</Detail>}
      {fabric.length > 0 && (
        <Detail label="Fabric detail">
          <div className="grid grid-cols-2 gap-2">
            {fabric.map((f) => (
              <div key={f.id} className="relative aspect-square overflow-hidden bg-bone">
                <Image src={f.url} alt={f.alt} fill sizes="200px" unoptimized={isSvgSource(f.url)} className="object-cover" />
              </div>
            ))}
          </div>
        </Detail>
      )}
    </dl>
  );
}

/** Product information shown beside a garment lifted off the rail. */
export function InspectOverlay({ item, currency, compact }: { item: ShowroomItem; currency: string; compact?: boolean }) {
  const { data: product, isLoading, isError } = useQuery({
    queryKey: ["product", item.slug],
    queryFn: () => api<ProductDetail>(`/api/products/${item.slug}`),
    staleTime: 60_000,
  });
  const close = () => useShowroomStore.getState().reset();

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-4 top-4 z-10 md:left-8 md:top-8">
        <InspectControls onReturn={close} />
      </motion.div>
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-0 right-0 z-10 max-h-[48%] w-full overflow-y-auto bg-ivory/95 p-6 shadow-2xl backdrop-blur md:top-0 md:max-h-none md:w-[400px] md:p-8"
        aria-label={`${item.name} details`}
      >
        <p className="eyebrow text-taupe">{item.brand}</p>
        <h2 className="mt-2 text-2xl font-medium tracking-tight">{item.name}</h2>
        <p className="mt-2 text-xs text-graphite">
          by{" "}
          <Link href={`/designers/${item.seller.slug}`} className="underline underline-offset-4">
            {item.seller.name}
          </Link>
          {item.seller.town || item.seller.county ? ` · ${[item.seller.town, item.seller.county].filter(Boolean).join(", ")}` : ""}
        </p>
        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : isError || !product ? (
            <p className="text-sm text-danger">Couldn&apos;t load this piece. Please try again.</p>
          ) : (
            <>
              <PurchasePanel product={product} currency={currency} compact />
              <div className="mt-5 space-y-3">
                <DeliveryCheck sellerId={item.seller.id} amountCents={product.priceCents} currency={currency} compact />
                <RepresentationNotice modelAccurate={product.model ? product.model.representation === "ACCURATE" : null} hasPhotos={!product.imagesAreIllustrative} />
              </div>
              {!compact && (
                <div className="mt-8">
                  <ProductFacts product={product} />
                </div>
              )}
              <Link href={`/products/${item.slug}`} className="mt-6 inline-block text-xs uppercase tracking-[0.16em] underline underline-offset-4">
                View full details
              </Link>
            </>
          )}
        </div>
      </motion.aside>
    </>
  );
}
