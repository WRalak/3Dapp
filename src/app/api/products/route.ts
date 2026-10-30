import { NextResponse } from "next/server";
import { productFilterSchema } from "@/lib/validation/catalog";
import { getProductCardsByIds, listProducts } from "@/server/services/catalog.service";
import { route } from "@/lib/api";

/** Public catalogue API (used by client-side search suggestions and recently viewed). */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (ids) {
    const items = await getProductCardsByIds(ids.split(",").filter((s) => /^[a-z0-9]{10,40}$/i.test(s)).slice(0, 24));
    return NextResponse.json({ items }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
  }
  const filter = productFilterSchema.parse(Object.fromEntries(url.searchParams));
  const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit") ?? 24) || 24));
  const result = await listProducts(filter, limit);
  return NextResponse.json(result, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
});
