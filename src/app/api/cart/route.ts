import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { cartAddSchema, cartUpdateSchema } from "@/lib/validation/catalog";
import { addToCart, getCart, updateCartItem } from "@/server/services/cart.service";
import { limitBy } from "@/lib/security/rate-limit";
import { rateLimited } from "@/lib/errors";
import { requestContextFrom } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** Cart + per-seller delivery quotes for a destination: ?county=<id>&town=<name>&sel=<sellerId>:<methodId>,… */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const clean = (v: string | null, max: number) => (v && v.length <= max ? v : null);
  const selections: Record<string, string> = {};
  for (const pair of (sp.get("sel") ?? "").split(",").slice(0, 30)) {
    const [seller, method] = pair.split(":");
    if (seller && method && seller.length <= 40 && method.length <= 40) selections[seller] = method;
  }
  const cart = await getCart({ countyId: clean(sp.get("county"), 40), town: clean(sp.get("town"), 80), selections });
  return NextResponse.json(cart, { headers: { "cache-control": "private, no-store" } });
});

export const POST = route(async (req) => {
  const rl = await limitBy("api", requestContextFrom(req).ip);
  if (!rl.success) throw rateLimited();
  const { variantId, quantity } = await parseJson(req, cartAddSchema);
  return NextResponse.json(await addToCart(variantId, quantity));
});

export const PATCH = route(async (req) => {
  const { itemId, quantity } = await parseJson(req, cartUpdateSchema);
  return NextResponse.json(await updateCartItem(itemId, quantity));
});
