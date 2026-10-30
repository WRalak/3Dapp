import { NextResponse } from "next/server";
import { parseJson, route } from "@/lib/api";
import { couponApplySchema } from "@/lib/validation/catalog";
import { applyCoupon, removeCoupon } from "@/server/services/cart.service";
import { limitBy } from "@/lib/security/rate-limit";
import { rateLimited } from "@/lib/errors";
import { requestContextFrom } from "@/lib/security/request";

export const POST = route(async (req) => {
  // Throttled to stop discount-code enumeration.
  const rl = await limitBy("checkout", `coupon:${requestContextFrom(req).ip}`);
  if (!rl.success) throw rateLimited();
  const { code } = await parseJson(req, couponApplySchema);
  return NextResponse.json(await applyCoupon(code));
});

export const DELETE = route(async () => NextResponse.json(await removeCoupon()));
