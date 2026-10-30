import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Users } from "lucide-react";
import { listPublicSellers } from "@/server/services/seller.service";
import { listCounties } from "@/server/services/delivery.service";
import { getT } from "@/i18n/server";
import { EmptyState } from "@/components/ui/misc";
import { isSvgSource } from "@/lib/media";

export const metadata: Metadata = {
  title: "Designers",
  description: "Shop independent Kenyan designers, tailors and boutiques — from Nairobi to Mombasa, Kisumu, Nakuru and Eldoret.",
  alternates: { canonical: "/designers" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function DesignersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const county = typeof sp.county === "string" ? sp.county : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : undefined;
  const [counties, t] = await Promise.all([listCounties(), getT()]);
  const countyId = county ? counties.find((c) => c.slug === county)?.id : undefined;
  const sellers = await listPublicSellers({ countyId, q });
  const withSellers = new Set(sellers.map((s) => s.county?.slug));

  return (
    <div className="container-luxe pt-10 md:pt-16">
      <p className="eyebrow text-taupe">{t("designers.eyebrow")}</p>
      <h1 className="mt-3 text-headline font-medium">{t("designers.title")}</h1>
      <p className="mt-4 max-w-2xl text-graphite">{t("designers.intro")}</p>

      <form className="mt-8 flex flex-wrap items-end gap-3" action="/designers">
        <label className="flex flex-col gap-1 text-xs text-taupe">
          {t("designers.search")}
          <input name="q" defaultValue={q} className="h-10 w-56 border bg-surface px-3 text-sm text-ink" placeholder="e.g. Ankara, tailor" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-taupe">
          {t("designers.county")}
          <select name="county" defaultValue={county ?? ""} className="h-10 w-48 border bg-surface px-3 text-sm text-ink">
            <option value="">{t("designers.allCounties")}</option>
            {counties.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="h-10 bg-ink px-5 text-xs uppercase tracking-[0.16em] text-ivory">{t("common.apply")}</button>
      </form>

      {sellers.length === 0 ? (
        <div className="mt-12">
          <EmptyState title={t("designers.none")} description={county && !withSellers.has(county) ? t("designers.noneInCounty") : undefined} />
        </div>
      ) : (
        <ul className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((s) => (
            <li key={s.id}>
              <Link href={`/designers/${s.slug}`} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-bone">
                  {s.profile?.coverUrl ? (
                    <Image src={s.profile.coverUrl} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" unoptimized={isSvgSource(s.profile.coverUrl)} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-medium tracking-tight text-taupe">{s.businessName.slice(0, 1)}</div>
                  )}
                  {s.isFeatured && <span className="absolute left-3 top-3 bg-ivory/90 px-2 py-1 text-[10px] uppercase tracking-[0.16em]">{t("designers.featured")}</span>}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-medium">{s.businessName}</h2>
                    <p className="mt-1 flex items-center gap-1 text-xs text-taupe">
                      <MapPin className="size-3" aria-hidden /> {[s.town, s.county?.name].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-taupe">
                    <Users className="size-3" aria-hidden /> {s.followerCount}
                  </span>
                </div>
                {s.profile?.description && <p className="mt-2 line-clamp-2 text-sm text-graphite">{s.profile.description}</p>}
                <p className="mt-2 text-xs text-taupe">{t("designers.pieces", { count: s._count.products })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
