import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AtSign, Globe, MapPin, Truck } from "lucide-react";
import { getPublicSeller, isFollowing } from "@/server/services/seller.service";
import { listProducts } from "@/server/services/catalog.service";
import { sellerCoverage } from "@/server/services/delivery.service";
import { productFilterSchema } from "@/lib/validation/catalog";
import { getCurrentUser } from "@/lib/auth/guards";
import { getT } from "@/i18n/server";
import { ProductGrid } from "@/components/products/product-card";
import { FollowButton, ContactSeller } from "@/components/marketplace/seller-actions";
import { EmptyState, Pagination } from "@/components/ui/misc";
import { isSvgSource } from "@/lib/media";
import { formatDate } from "@/lib/utils";

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const seller = await getPublicSeller((await params).slug);
  if (!seller) return { title: "Designer not found" };
  const place = [seller.town, seller.county?.name].filter(Boolean).join(", ");
  return {
    title: `${seller.businessName}${place ? ` — ${place}` : ""}`,
    description: seller.profile?.description.slice(0, 155),
    alternates: { canonical: `/designers/${seller.slug}` },
  };
}

const DELIVERY_LABEL: Record<string, string> = { SAME_DAY: "Same-day", NEXT_DAY: "Next-day", STANDARD: "Standard", COURIER: "Courier", PICKUP: "Pickup", SELLER_ARRANGED: "Seller-arranged" };

export default async function DesignerPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug } = await params;
  const sp = await searchParams;
  const seller = await getPublicSeller(slug);
  if (!seller) notFound();
  const filter = productFilterSchema.parse({ ...sp, seller: slug });
  const [products, user, coverage, t] = await Promise.all([listProducts(filter), getCurrentUser(), sellerCoverage(seller.id), getT()]);
  const following = await isFollowing(user?.id, seller.id);
  const methods = [...new Set(seller.zones.flatMap((z) => z.methods.map((m) => m.type)))];
  const place = [seller.town, seller.county?.name].filter(Boolean).join(", ");

  return (
    <>
      <section className="relative">
        <div className="relative h-48 bg-bone md:h-72">
          {seller.profile?.coverUrl && <Image src={seller.profile.coverUrl} alt="" fill priority sizes="100vw" unoptimized={isSvgSource(seller.profile.coverUrl)} className="object-cover" />}
        </div>
        <div className="container-luxe -mt-12 flex flex-col gap-6 md:-mt-16 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-5">
            <div className="relative size-24 shrink-0 overflow-hidden border-4 border-ivory bg-surface md:size-32">
              {seller.profile?.logoUrl ? (
                <Image src={seller.profile.logoUrl} alt={`${seller.businessName} logo`} fill sizes="128px" unoptimized={isSvgSource(seller.profile.logoUrl)} className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl font-medium">{seller.businessName.slice(0, 1)}</span>
              )}
            </div>
            <div className="pb-1">
              <h1 className="text-3xl font-medium tracking-tight md:text-4xl">{seller.businessName}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-taupe">
                {place && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {place}
                  </span>
                )}
                <span>{t("designers.followers", { count: seller.followerCount })}</span>
                {seller.approvedAt && <span>{t("designers.since", { date: formatDate(seller.approvedAt, { year: "numeric", month: "short" }) })}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FollowButton sellerId={seller.id} following={following} signedIn={!!user} size="md" />
            <ContactSeller sellerId={seller.id} sellerName={seller.businessName} signedIn={!!user} />
          </div>
        </div>
      </section>

      <div className="container-luxe mt-10 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="max-w-3xl whitespace-pre-line leading-relaxed text-graphite">{seller.profile?.description}</p>
          <h2 className="mt-12 text-2xl font-medium tracking-tight">{t("designers.collection")}</h2>
          <div className="mt-6">
            {products.items.length === 0 ? (
              <EmptyState title={t("designers.noProducts")} />
            ) : (
              <>
                <ProductGrid products={products.items} className="xl:grid-cols-3" />
                <Pagination page={products.page} pageCount={products.pageCount} hrefFor={(p) => `/designers/${slug}?page=${p}`} />
              </>
            )}
          </div>
        </div>
        <aside className="h-fit space-y-6 border bg-surface p-6 text-sm">
          <div>
            <h2 className="eyebrow mb-2 flex items-center gap-2">
              <Truck className="size-4" /> {t("designers.delivery")}
            </h2>
            {coverage.length ? (
              <p className="text-graphite">{coverage.length > 6 ? t("designers.deliversToMany", { count: coverage.length }) : coverage.map((c) => c.name).join(", ")}</p>
            ) : (
              <p className="text-taupe">{t("designers.pickupOnly")}</p>
            )}
            {methods.length > 0 && <p className="mt-2 text-xs text-taupe">{methods.map((m) => DELIVERY_LABEL[m]).join(" · ")}</p>}
          </div>
          {seller.profile?.returnPolicy && (
            <div>
              <h2 className="eyebrow mb-2">{t("designers.returns")}</h2>
              <p className="whitespace-pre-line text-graphite">{seller.profile.returnPolicy}</p>
            </div>
          )}
          {(seller.profile?.website || seller.profile?.instagram) && (
            <div className="space-y-1">
              {seller.profile.website && (
                <a href={seller.profile.website} rel="noopener nofollow ugc" target="_blank" className="flex items-center gap-2 underline-offset-4 hover:underline">
                  <Globe className="size-4" /> {seller.profile.website.replace(/^https:\/\//, "")}
                </a>
              )}
              {seller.profile.instagram && (
                <a href={`https://instagram.com/${encodeURIComponent(seller.profile.instagram)}`} rel="noopener nofollow ugc" target="_blank" className="flex items-center gap-2 underline-offset-4 hover:underline">
                  <AtSign className="size-4" /> @{seller.profile.instagram}
                </a>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
