import Link from "next/link";
import { MapPin } from "lucide-react";
import type { SellerSummary } from "@/types/catalog";

/** "Sold by" block — every listing shows who makes/sells it and where they are. */
export function SoldBy({ seller, children }: { seller: SellerSummary; children?: React.ReactNode }) {
  const place = [seller.town, seller.county].filter(Boolean).join(", ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4 text-sm">
      <div>
        <p className="text-xs text-taupe">Sold by</p>
        <Link href={`/designers/${seller.slug}`} className="link-underline font-medium">
          {seller.name}
        </Link>
        {place && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-taupe">
            <MapPin className="size-3" aria-hidden /> {place}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Fabric accuracy: we only claim true colour/texture when the 3D model was built from the real
 * garment or real photography exists. Everything else is labelled as an illustration.
 */
export function RepresentationNotice({ modelAccurate, hasPhotos }: { modelAccurate: boolean | null; hasPhotos: boolean }) {
  if (modelAccurate && hasPhotos) return null;
  const text =
    modelAccurate === null
      ? hasPhotos
        ? null
        : "Images are illustrations of the garment shape — fabric pattern and colour may differ. Ask the designer for real photos."
      : !modelAccurate
        ? "The 3D view shows the cut and fit only — it is not a scan of the real fabric. Check the photos for the actual print and colour."
        : "No product photos yet — the 3D view is built from the real garment.";
  if (!text) return null;
  return <p className="border-l-2 border-clay/60 bg-bone/50 px-3 py-2 text-xs leading-relaxed text-graphite">{text}</p>;
}
