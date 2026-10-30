"use client";

import Link from "next/link";
import { useLite } from "@/i18n/client";
import Image from "next/image";
import { Box, Heart } from "lucide-react";
import { motion } from "framer-motion";
import { Price } from "@/components/ui/misc";
import { useToggleWishlist, useWishlistIds } from "@/hooks/use-wishlist";
import { isSvgSource } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/types/catalog";

export function ProductCard({ product, priority, index = 0 }: { product: ProductCardData; priority?: boolean; index?: number }) {
  const { data: wishlist } = useWishlistIds();
  const toggle = useToggleWishlist();
  const saved = wishlist?.ids.includes(product.id) ?? false;
  const lite = useLite(); // Lite mode: smaller images, no hover image download

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, delay: Math.min(index, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <Link href={`/products/${product.slug}`} className="block" aria-label={`${product.name} by ${product.seller.name}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-bone">
          {product.image && (
            <Image
              src={product.image}
              alt={product.name}
              fill
              priority={priority}
              quality={lite ? 45 : 75}
              unoptimized={isSvgSource(product.image)}
              sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
              className={cn("object-cover transition-all duration-[1200ms] ease-[var(--ease-luxe)] group-hover:scale-[1.03]", product.hoverImage && "group-hover:opacity-0")}
            />
          )}
          {product.hoverImage && !lite && (
            <Image
              src={product.hoverImage}
              alt=""
              fill
              unoptimized={isSvgSource(product.hoverImage)}
              sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
              className="object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            />
          )}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.isNew && <span className="bg-ivory px-2 py-1 text-[10px] uppercase tracking-[0.16em]">New</span>}
            {product.compareAtCents && <span className="bg-clay px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory">Sale</span>}
            {!product.inStock && <span className="bg-ink/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory">Sold out</span>}
          </div>
          {product.has3d && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 bg-ivory/90 px-2 py-1 text-[10px] uppercase tracking-[0.16em]" title="Inspect in 3D">
              <Box className="size-3" aria-hidden /> 3D
            </span>
          )}
        </div>
        <div className="mt-4 space-y-1">
          <p className="eyebrow truncate text-taupe">{product.seller.name}</p>
          <h3 className="text-sm leading-snug">{product.name}</h3>
          {product.seller.town && <p className="truncate text-[11px] text-taupe">{product.seller.town}</p>}
          <Price cents={product.priceCents} compareAt={product.compareAtCents} className="text-sm text-graphite" />
          {product.colors.length > 1 && (
            <div className="flex items-center gap-1.5 pt-1" aria-label={`${product.colors.length} colours`}>
              {product.colors.slice(0, 5).map((c) => (
                <span key={c.name} title={c.name} className="size-2.5 rounded-full border border-ink/10" style={{ backgroundColor: c.hex }} />
              ))}
            </div>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => toggle.mutate(product.id)}
        className="absolute right-2 top-2 p-2 text-ink/70 transition-colors hover:text-ink"
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={saved}
      >
        <Heart className={cn("size-[18px]", saved && "fill-ink text-ink")} strokeWidth={1.5} />
      </button>
    </motion.article>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: ProductCardData[]; priorityCount?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} index={i} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[3/4]" />
          <div className="skeleton mt-4 h-3 w-1/3" />
          <div className="skeleton mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
