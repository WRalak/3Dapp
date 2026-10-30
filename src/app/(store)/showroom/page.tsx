import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/config/env";
import { db } from "@/lib/db/prisma";
import { getShowroomItems } from "@/server/services/catalog.service";
import { ShowroomClient } from "./showroom-client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "3D Showroom",
  description: "Browse independent Kenyan designers on a virtual clothing rail. Slide, pick and inspect every piece in 3D.",
};

export default async function ShowroomPage({ searchParams }: { searchParams: Promise<{ category?: string; collection?: string; mode?: string }> }) {
  const sp = await searchParams;
  const category = sp.category && /^[a-z0-9-]{1,40}$/.test(sp.category) ? sp.category : undefined;
  const [items, categories] = await Promise.all([
    getShowroomItems({ category }),
    db.category.findMany({ where: { isActive: true, slug: { in: ["women", "men", "children", "sportswear", "luxury"] } }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
  ]);

  return (
    <div>
      <div className="container-luxe flex flex-col gap-5 py-6 md:flex-row md:items-end md:justify-between md:py-10">
        <div>
          <p className="eyebrow mb-3 text-taupe">The digital showroom</p>
          <h1 className="text-headline font-medium">The rail</h1>
        </div>
        <nav aria-label="Filter the rail" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {[{ slug: undefined, name: "Everything" }, ...categories].map((c) => (
            <Link
              key={c.slug ?? "all"}
              href={c.slug ? `/showroom?category=${c.slug}` : "/showroom"}
              aria-current={category === c.slug ? "page" : undefined}
              className={cn("shrink-0 border px-4 py-2 text-xs uppercase tracking-[0.14em]", category === c.slug ? "border-ink bg-ink text-ivory" : "hover:border-ink")}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
      <ShowroomClient items={items} currency={env().STORE_CURRENCY} forceFallback={sp.mode === "2d"} />
      <p className="container-luxe mt-4 text-xs text-taupe">
        Prefer a flat view?{" "}
        <Link href={`/showroom?${new URLSearchParams({ ...(category ? { category } : {}), mode: sp.mode === "2d" ? "3d" : "2d" })}`} className="underline underline-offset-4">
          {sp.mode === "2d" ? "Switch to 3D" : "Switch to 2D gallery"}
        </Link>
      </p>
    </div>
  );
}
