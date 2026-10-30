import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { env } from "@/config/env";
import { getApprovedReviews, getProductBySlug, getRecommendations, getRelatedProducts } from "@/server/services/catalog.service";
import { getCurrentUser } from "@/lib/auth/guards";
import { ProductGallery } from "@/components/products/product-gallery";
import { PurchasePanel } from "@/components/products/purchase-panel";
import { ProductGrid } from "@/components/products/product-card";
import { ProductViewTracker, RecentlyViewed } from "@/components/products/product-tracking";
import { ProductFacts } from "@/components/showroom/inspect-panel";
import { ReviewForm } from "@/components/products/review-form";
import { Rating, SectionHeading } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { listCounties } from "@/server/services/delivery.service";
import { isFollowing } from "@/server/services/seller.service";
import { RepresentationNotice, SoldBy } from "@/components/marketplace/seller-card";
import { DeliveryCheck } from "@/components/marketplace/delivery-check";
import { ContactSeller, FollowButton, ReportProduct } from "@/components/marketplace/seller-actions";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description.slice(0, 155),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.seoDescription ?? undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const currency = env().STORE_CURRENCY;
  const [reviews, recommended, related, user, counties] = await Promise.all([getApprovedReviews(product.id), getRecommendations(product.id), getRelatedProducts(product.id, 8), getCurrentUser(), listCounties()]);
  const following = await isFollowing(user?.id, product.seller.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    brand: { "@type": "Brand", name: product.brand },
    sku: product.variants[0]?.sku,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: currency,
      lowPrice: (product.priceCents / 100).toFixed(2),
      availability: product.totalStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.seller.name },
    },
    ...(product.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount } } : {}),
  };

  return (
    <>
      {/* JSON-LD: serialized with < escaped so content can never break out of the script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductViewTracker productId={product.id} />
      <nav aria-label="Breadcrumb" className="container-luxe pt-6 text-xs text-taupe">
        <Link href="/shop" className="hover:text-ink">
          Shop
        </Link>{" "}
        /{" "}
        <Link href={`/shop?category=${product.categorySlug}`} className="hover:text-ink">
          {product.category}
        </Link>{" "}
        / <span className="text-graphite">{product.name}</span>
      </nav>

      <div className="container-luxe grid gap-10 pt-6 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <ProductGallery images={product.images} name={product.name} model={product.model} garmentKind={product.garmentKind} color={product.colors[0]?.hex ?? "#2b2a28"} />
        </div>
        <div className="lg:col-span-5">
          <Link href={`/shop?brand=${product.brandSlug}`} className="eyebrow text-taupe hover:text-ink">
            {product.brand}
          </Link>
          <h1 className="mt-3 text-4xl font-medium tracking-tight md:text-5xl">{product.name}</h1>
          {product.ratingCount > 0 && (
            <a href="#reviews" className="mt-3 inline-block">
              <Rating value={product.ratingAvg} count={product.ratingCount} />
            </a>
          )}
          <div className="mt-6">
            <SoldBy seller={product.seller}>
              <FollowButton sellerId={product.seller.id} following={following} signedIn={!!user} />
              <ContactSeller sellerId={product.seller.id} sellerName={product.seller.name} productId={product.id} signedIn={!!user} />
            </SoldBy>
          </div>
          <div className="mt-6">
            <PurchasePanel product={product} currency={currency} />
          </div>
          <div className="mt-6 space-y-4">
            <DeliveryCheck sellerId={product.seller.id} counties={counties.map((c) => ({ id: c.id, name: c.name }))} amountCents={product.priceCents} currency={currency} />
            <RepresentationNotice modelAccurate={product.model ? product.model.representation === "ACCURATE" : null} hasPhotos={!product.imagesAreIllustrative} />
          </div>
          <div className="mt-10" id="size-guide">
            <ProductFacts product={product} />
            {product.specifications && (
              <dl className="grid grid-cols-2 gap-x-6 border-t py-4 text-sm">
                {product.specifications.map((s) => (
                  <div key={s.label} className="py-1">
                    <dt className="text-taupe">{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>

      {recommended.length > 0 && (
        <section className="container-luxe mt-24 md:mt-32">
          <SectionHeading eyebrow="Complete the look" title="Customers also bought" />
          <ProductGrid products={recommended} />
        </section>
      )}

      <section id="reviews" className="container-luxe mt-24 grid gap-12 md:mt-32 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="text-3xl font-medium tracking-tight">Reviews</h2>
          {product.ratingCount > 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-4xl font-medium">{product.ratingAvg.toFixed(1)}</span>
              <Rating value={product.ratingAvg} count={product.ratingCount} size="md" />
            </div>
          ) : (
            <p className="mt-4 text-sm text-taupe">No reviews yet.</p>
          )}
          <div className="mt-8">
            <ReviewForm productId={product.id} signedIn={!!user} />
          </div>
        </div>
        <ul className="divide-y lg:col-span-8">
          {reviews.map((r) => (
            <li key={r.id} className="py-6">
              <div className="flex items-center justify-between gap-4">
                <Rating value={r.rating} />
                <span className="text-xs text-taupe">{formatDate(r.createdAt)}</span>
              </div>
              <p className="mt-3 font-medium">{r.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{r.body}</p>
              <p className="mt-3 text-xs text-taupe">
                {r.user.name ?? "Customer"}
                {r.verifiedPurchase && " · Verified purchase"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section className="container-luxe mt-24 md:mt-32">
          <SectionHeading eyebrow="You may also like" title="Related pieces" />
          <ProductGrid products={related.slice(0, 4)} />
        </section>
      )}
      <div className="container-luxe mt-10">
        <ReportProduct productId={product.id} signedIn={!!user} />
      </div>
      <RecentlyViewed excludeId={product.id} />
    </>
  );
}
