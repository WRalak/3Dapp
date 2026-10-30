"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRecentlyViewed } from "@/stores/ui-store";
import { api } from "@/lib/fetcher";
import { ProductGrid } from "./product-card";
import type { ProductCardData } from "@/types/catalog";

/** Records a product view (first-party analytics) and remembers it for "recently viewed". */
export function ProductViewTracker({ productId }: { productId: string }) {
  const add = useRecentlyViewed((s) => s.add);
  useEffect(() => {
    add(productId);
    void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "PRODUCT_VIEW", productId }) });
  }, [productId, add]);
  return null;
}

export function RecentlyViewed({ excludeId, title = "Recently viewed" }: { excludeId?: string; title?: string }) {
  const ids = useRecentlyViewed((s) => s.ids).filter((id) => id !== excludeId).slice(0, 4);
  const { data } = useQuery({
    queryKey: ["recently-viewed", ids],
    queryFn: () => api<{ items: ProductCardData[] }>(`/api/products?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
  if (!data?.items.length) return null;
  return (
    <section className="container-luxe mt-24" aria-labelledby="recently-viewed">
      <h2 id="recently-viewed" className="mb-8 text-2xl font-medium tracking-tight">
        {title}
      </h2>
      <ProductGrid products={data.items} />
    </section>
  );
}

export function SessionTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("atelier-session")) return;
      sessionStorage.setItem("atelier-session", "1");
    } catch {
      /* storage unavailable */
    }
    void fetch("/api/analytics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "SESSION_START" }) });
  }, []);
  return null;
}
