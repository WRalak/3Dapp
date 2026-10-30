import type { Metadata } from "next";
import Link from "next/link";
import { listCollections } from "@/server/services/catalog.service";
import { garmentArtwork } from "@/lib/media";
import { EmptyState } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Collections" };

const ART = [
  ["COAT", "#4b3326"],
  ["DRESS", "#9aa58d"],
  ["SHIRT", "#1c1b19"],
  ["KNIT", "#b88a5a"],
] as const;

export default async function CollectionsPage() {
  const collections = await listCollections();
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <p className="eyebrow mb-3 text-taupe">Edits</p>
      <h1 className="mb-12 text-headline font-medium">Collections</h1>
      {collections.length === 0 ? (
        <EmptyState title="No collections yet" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {collections.map((c, i) => {
            const [kind, hex] = ART[i % ART.length]!;
            return (
              <Link key={c.id} href={`/collections/${c.slug}`} className="group relative flex aspect-[5/4] flex-col justify-end overflow-hidden bg-ink p-8 text-ivory md:p-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.heroImageUrl ?? garmentArtwork(kind, hex)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-[1400ms] group-hover:scale-105" />
                <div className="relative">
                  <p className="eyebrow text-ivory/70">{c._count.products} pieces</p>
                  <h2 className="mt-3 text-4xl font-medium tracking-tight">{c.name}</h2>
                  <p className="mt-3 max-w-md text-sm text-ivory/80">{c.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
