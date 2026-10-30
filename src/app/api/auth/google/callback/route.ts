import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { exchangeGoogleCode, OAUTH_STATE_COOKIE } from "@/lib/auth/google";
import { safeEqual, verifyPayload } from "@/lib/security/crypto";
import { createSession } from "@/lib/auth/session";
import { requestContextFrom } from "@/lib/security/request";
import { findOrCreateOAuthUser } from "@/server/services/auth.service";
import { mergeGuestCart } from "@/server/services/cart.service";
import { db } from "@/lib/db/prisma";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, env().APP_URL));
  const jar = await cookies();
  const raw = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  const stored = raw ? verifyPayload<{ state: string; verifier: string; next: string }>(raw, env().AUTH_SECRET) : null;
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!stored || !code || !safeEqual(state, stored.state)) return fail("oauth_state");

  try {
    const profile = await exchangeGoogleCode(code, stored.verifier);
    const user = await findOrCreateOAuthUser(profile);
    if (user.status !== "ACTIVE") return fail("suspended");
    const ctx = requestContextFrom(req);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ctx.ip } });
    await db.loginAttempt.create({ data: { email: user.email, ip: ctx.ip, userAgent: ctx.userAgent, success: true, reason: "google" } });
    await createSession(user, { ...ctx, mfaVerified: false });
    await mergeGuestCart(user.id);
    // Staff must still complete MFA; the admin guard redirects to the challenge.
    return NextResponse.redirect(new URL(user.isStaff ? "/admin" : stored.next, env().APP_URL));
  } catch (err) {
    logError(err, { where: "google-callback" });
    return fail("oauth_failed");
  }
}
