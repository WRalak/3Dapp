import type { Metadata } from "next";
import { listProducts } from "@/server/services/catalog.service";
import { productFilterSchema } from "@/lib/validation/catalog";
import { ProductGrid } from "@/components/products/product-card";
import { Pagination } from "@/components/ui/misc";

export const metadata: Metadata = { title: "New Arrivals" };

export default async function NewArrivalsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const result = await listProducts(productFilterSchema.parse({ sort: "newest", page: sp.page }));
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">Just landed</p>
      <h1 className="mb-12 text-headline font-medium">New arrivals</h1>
      <ProductGrid products={result.items} priorityCount={4} />
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => `/new-arrivals?page=${p}`} />
    </div>
  );
}
