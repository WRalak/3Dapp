import type { GarmentKindName } from "@/types/catalog";

/**
 * Editorial placeholder artwork rendered on the server as SVG. Used when a product has no
 * photography yet, so the storefront never shows a broken image.
 */
export function garmentArtwork(kind: GarmentKindName, hex: string, view: "front" | "back" | "detail" = "front") {
  const params = new URLSearchParams({ kind, color: hex.replace("#", ""), view });
  return `/api/media/garment?${params.toString()}`;
}

export function isSvgSource(src: string) {
  return src.startsWith("/api/media/garment") || src.endsWith(".svg");
}
