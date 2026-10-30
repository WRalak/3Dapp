import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { getCurrentUser, requireUser } from "@/lib/auth/guards";
import { getWishlistProductIds, toggleWishlist } from "@/server/services/wishlist.service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await getCurrentUser();
  const ids = user ? await getWishlistProductIds(user.id) : [];
  return NextResponse.json({ ids, authenticated: !!user }, { headers: { "cache-control": "private, no-store" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { productId } = await parseJson(req, z.object({ productId: z.string().min(1) }));
  return NextResponse.json(await toggleWishlist(user.id, productId));
});
