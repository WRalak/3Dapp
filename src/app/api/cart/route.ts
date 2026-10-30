import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { cartAddSchema, cartUpdateSchema } from "@/lib/validation/catalog";
import { addToCart, getCart, updateCartItem } from "@/server/services/cart.service";
import { limitBy } from "@/lib/security/rate-limit";
import { rateLimited } from "@/lib/errors";
import { requestContextFrom } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const shipping = new URL(req.url).searchParams.get("shipping");
  const method = shipping === "express" || shipping === "pickup" ? shipping : "standard";
  return NextResponse.json(await getCart(method), { headers: { "cache-control": "private, no-store" } });
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
