import { renderGarmentSvg } from "@/features/showroom/garment-svg";

/** Deterministic editorial placeholder artwork. Immutable for given params → long CDN cache. */
export function GET(req: Request) {
  const url = new URL(req.url);
  const svg = renderGarmentSvg(url.searchParams.get("kind") ?? "TOP", url.searchParams.get("color") ?? "2b2a28", url.searchParams.get("view") ?? "front");
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
