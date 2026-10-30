import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/guards";
import { randomToken } from "@/lib/security/crypto";
import { limitBy } from "@/lib/security/rate-limit";
import { requestContextFrom } from "@/lib/security/request";
import { trackEvent } from "@/server/services/analytics.service";

const VISITOR_COOKIE = "atelier_vid";
const schema = z.object({
  type: z.enum(["SESSION_START", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT_STARTED", "SHOWROOM_INSPECT"]),
  productId: z.string().max(40).optional(),
});

/** First-party, cookie-scoped analytics (no third-party trackers). */
export const POST = route(async (req) => {
  const rl = await limitBy("api", `analytics:${requestContextFrom(req).ip}`);
  if (!rl.success) return NextResponse.json({ ok: false }, { status: 429 });
  const { type, productId } = await parseJson(req, schema);
  const jar = await cookies();
  let vid = jar.get(VISITOR_COOKIE)?.value;
  if (!vid || !/^[A-Za-z0-9_-]{16,40}$/.test(vid)) {
    vid = randomToken(16);
    jar.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  const user = await getCurrentUser();
  await trackEvent(type, vid, { userId: user?.id, productId });
  return NextResponse.json({ ok: true });
});
