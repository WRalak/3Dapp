import type { Metadata } from "next";
import { Suspense } from "react";
import { productFilterSchema } from "@/lib/validation/catalog";
import { getFacets, listProducts } from "@/server/services/catalog.service";
import { ProductGrid, ProductGridSkeleton } from "@/components/products/product-card";
import { FilterSidebar, ShopToolbar } from "@/components/products/filters";
import { EmptyState, Pagination } from "@/components/ui/misc";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = typeof sp.category === "string" ? sp.category : null;
  return {
    title: sp.q ? `Search: ${sp.q}` : cat ? `Shop ${cat[0]!.toUpperCase()}${cat.slice(1)}` : "Shop",
    alternates: { canonical: cat ? `/shop?category=${cat}` : "/shop" },
  };
}

async function Results({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const filter = productFilterSchema.parse(sp);
  const [result, facets] = await Promise.all([listProducts(filter), getFacets()]);
  const hrefFor = (page: number) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    p.set("page", String(page));
    return `/shop?${p.toString()}`;
  };
  return (
    <>
      <ShopToolbar facets={facets} total={result.total} />
      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
        <FilterSidebar facets={facets} />
        <div>
          {result.items.length === 0 ? (
            <EmptyState title="Nothing matches those filters" description="Try removing a filter or searching for something broader." />
          ) : (
            <ProductGrid products={result.items} priorityCount={4} className="xl:grid-cols-3 2xl:grid-cols-4" />
          )}
          <Pagination page={result.page} pageCount={result.pageCount} hrefFor={hrefFor} />
        </div>
      </div>
    </>
  );
}

export default async function ShopPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const heading = typeof sp.q === "string" && sp.q ? `“${sp.q}”` : typeof sp.category === "string" ? sp.category.replace(/-/g, " ") : "The collection";
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">{typeof sp.q === "string" && sp.q ? "Search results" : "Shop"}</p>
      <h1 className="mb-8 text-headline font-medium capitalize">{heading}</h1>
      <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
        <Results sp={sp} />
      </Suspense>
    </div>
  );
}
