import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getHomeData, getShowroomItems } from "@/server/services/catalog.service";
import { env } from "@/config/env";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";
import { ProductGrid } from "@/components/products/product-card";
import { ShowroomPreview } from "@/components/showroom/showroom-preview";
import { NewsletterForm } from "@/components/store/newsletter-form";
import { HeroMotion } from "@/components/store/hero-motion";
import { garmentArtwork } from "@/lib/media";

export const revalidate = 120;

export default async function HomePage() {
  const [home, rail] = await Promise.all([getHomeData(), getShowroomItems()]);
  const currency = env().STORE_CURRENCY;
  const hero = home.blocks.find((b) => b.placement === "home.hero");
  const promo = home.blocks.find((b) => b.placement === "home.promo");
  const banner = home.blocks.find((b) => b.placement === "home.banner");
  const editorial = home.blocks.find((b) => b.placement === "home.editorial");
  const testimonials = home.blocks.filter((b) => b.placement === "home.testimonials");

  return (
    <>
      {banner && (
        <div className="bg-ink py-2.5 text-center text-[11px] uppercase tracking-[0.18em] text-ivory">
          {banner.title}
          {banner.subtitle && <span className="hidden text-stone sm:inline"> · {banner.subtitle}</span>}
        </div>
      )}

      {/* Editorial hero */}
      <section className="container-luxe grid min-h-[78vh] items-end gap-10 pb-12 pt-10 md:grid-cols-12 md:pb-20 md:pt-16">
        <HeroMotion className="md:col-span-7">
          <p className="eyebrow mb-6 text-taupe">{hero?.subtitle ?? "New season"}</p>
          <h1 className="text-display font-medium">{hero?.title ?? "Walk the rail."}</h1>
          <p className="mt-8 max-w-md text-base leading-relaxed text-graphite md:text-lg">{hero?.body}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={hero?.ctaHref ?? "/showroom"}>{hero?.ctaLabel ?? "Enter the showroom"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/shop">Shop the collection</Link>
            </Button>
          </div>
        </HeroMotion>
        <div className="grid grid-cols-2 gap-3 md:col-span-5">
          {home.featured.slice(0, 2).map((p, i) => (
            <Link key={p.id} href={`/products/${p.slug}`} className={`group relative block overflow-hidden bg-bone ${i === 0 ? "aspect-[3/4.4]" : "mt-16 aspect-[3/4.4]"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image ?? garmentArtwork(p.garmentKind, "#2b2a28")} alt={p.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-105" />
              <span className="absolute bottom-3 left-3 bg-ivory/90 px-2 py-1 text-[10px] uppercase tracking-[0.14em]">{p.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured collections */}
      {home.collections.length > 0 && (
        <section className="container-luxe py-16 md:py-24" aria-labelledby="collections-heading">
          <SectionHeading eyebrow="Collections" title="Edited for the season" action={<Link href="/collections" className="link-underline text-sm">All collections</Link>} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {home.collections.map((c, i) => (
              <Link key={c.id} href={`/collections/${c.slug}`} className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden bg-ink p-6 text-ivory">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.heroImageUrl ?? garmentArtwork(["COAT", "DRESS", "SHIRT", "KNIT"][i % 4] as "COAT", ["#4b3326", "#9aa58d", "#1c1b19", "#b88a5a"][i % 4]!)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-all duration-[1400ms] group-hover:scale-105 group-hover:opacity-60" />
                <div className="relative">
                  <p className="eyebrow text-ivory/70">{c.count} pieces</p>
                  <h3 className="mt-2 text-2xl font-medium tracking-tight">{c.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-ivory/80">{c.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* New arrivals */}
      <section className="container-luxe py-16 md:py-24" aria-labelledby="new-heading">
        <SectionHeading eyebrow="Just in" title="New arrivals" action={<Link href="/new-arrivals" className="link-underline text-sm">View all</Link>} />
        <ProductGrid products={home.newArrivals} />
      </section>

      {/* Showroom preview */}
      <section className="py-16 md:py-24" aria-labelledby="showroom-heading">
        <div className="container-luxe">
          <SectionHeading
            eyebrow="The digital showroom"
            title="Pick it off the rail"
            action={
              <Button asChild variant="outline">
                <Link href="/showroom">
                  Open showroom <ArrowUpRight />
                </Link>
              </Button>
            }
          />
        </div>
        <ShowroomPreview items={rail.slice(0, 10)} currency={currency} />
      </section>

      {/* Trending */}
      <section className="container-luxe py-16 md:py-24">
        <SectionHeading eyebrow="Most viewed this fortnight" title="Trending now" />
        <ProductGrid products={home.trending.slice(0, 4)} />
      </section>

      {/* Promotion */}
      {promo && (
        <section className="container-luxe py-8">
          <div className="flex flex-col items-start justify-between gap-6 bg-clay px-8 py-12 text-ivory md:flex-row md:items-center md:px-14 md:py-16">
            <div>
              <h2 className="text-headline font-medium">{promo.title}</h2>
              {promo.subtitle && <p className="mt-3 text-ivory/80">{promo.subtitle}</p>}
            </div>
            {promo.ctaHref && (
              <Button asChild variant="inverse" size="lg">
                <Link href={promo.ctaHref}>{promo.ctaLabel ?? "Shop now"}</Link>
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Designers */}
      {home.brands.length > 0 && (
        <section className="container-luxe py-16 md:py-24">
          <SectionHeading eyebrow="Featured houses" title="The designers" />
          <ul className="grid border-t sm:grid-cols-2 lg:grid-cols-3">
            {home.brands.map((b) => (
              <li key={b.id} className="border-b sm:odd:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0">
                <Link href={`/shop?brand=${b.slug}`} className="group flex h-full flex-col justify-between gap-6 p-8 transition-colors hover:bg-bone">
                  <span className="text-2xl font-medium tracking-tight">{b.name}</span>
                  <span className="flex items-end justify-between gap-4 text-sm text-taupe">
                    {b.description}
                    <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Best sellers */}
      <section className="container-luxe py-16 md:py-24">
        <SectionHeading eyebrow="Customer favourites" title="Best sellers" action={<Link href="/shop?sort=best-selling" className="link-underline text-sm">Shop best sellers</Link>} />
        <ProductGrid products={home.bestSellers.slice(0, 4)} />
      </section>

      {/* Editorial */}
      {editorial && (
        <section className="container-luxe grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="relative aspect-[4/5] overflow-hidden bg-bone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editorial.imageUrl ?? garmentArtwork("COAT", "#b88a5a", "detail")} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <div className="md:pl-12">
            <p className="eyebrow mb-6 text-taupe">{editorial.subtitle}</p>
            <h2 className="text-headline font-medium">{editorial.title}</h2>
            <p className="mt-6 max-w-md leading-relaxed text-graphite">{editorial.body}</p>
            {editorial.ctaHref && (
              <Link href={editorial.ctaHref} className="link-underline mt-8 inline-block text-sm uppercase tracking-[0.16em]">
                {editorial.ctaLabel}
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="bg-bone py-16 md:py-24" aria-labelledby="testimonials-heading">
          <div className="container-luxe">
            <p id="testimonials-heading" className="eyebrow mb-10 text-taupe">
              From our clients
            </p>
            <div className="grid gap-10 md:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.id}>
                  <blockquote className="text-lg leading-relaxed tracking-tight">“{t.body}”</blockquote>
                  <figcaption className="mt-6 text-sm text-taupe">
                    {t.title}
                    {typeof t.data?.location === "string" && ` — ${t.data.location}`}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="container-luxe py-16 md:py-24">
        <div className="mx-auto max-w-xl text-center">
          <p className="eyebrow mb-4 text-taupe">The Atelier letter</p>
          <h2 className="text-headline font-medium">First look at every drop</h2>
          <div className="mt-8 text-left">
            <NewsletterForm tone="light" />
          </div>
        </div>
      </section>
    </>
  );
}
