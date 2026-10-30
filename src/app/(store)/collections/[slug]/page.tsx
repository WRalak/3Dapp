import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCollection, listProducts } from "@/server/services/catalog.service";
import { productFilterSchema } from "@/lib/validation/catalog";
import { ProductGrid } from "@/components/products/product-card";
import { EmptyState, Pagination } from "@/components/ui/misc";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; sort?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCollection((await params).slug);
  return c ? { title: c.name, description: c.description ?? undefined } : { title: "Not found" };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const collection = await getCollection(slug);
  if (!collection) notFound();
  const result = await listProducts(productFilterSchema.parse({ collection: slug, page: sp.page, sort: sp.sort }));
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <Link href="/collections" className="eyebrow text-taupe hover:text-ink">
        ← Collections
      </Link>
      <div className="mb-12 mt-6 grid gap-6 md:grid-cols-2 md:items-end">
        <h1 className="text-display font-medium">{collection.name}</h1>
        <p className="max-w-md text-graphite md:justify-self-end">{collection.description}</p>
      </div>
      {result.items.length === 0 ? <EmptyState title="This collection is being curated" /> : <ProductGrid products={result.items} priorityCount={4} />}
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => `/collections/${slug}?page=${p}`} />
    </div>
  );
}
