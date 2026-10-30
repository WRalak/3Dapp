import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getProductBySlug } from "@/server/services/catalog.service";

/** Full product detail for the showroom inspection panel. */
export const GET = route(async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw notFound("Product");
  const product = await getProductBySlug(slug);
  if (!product) throw notFound("Product");
  return NextResponse.json(product, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
});
