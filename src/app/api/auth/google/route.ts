import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { createGoogleAuthorization, googleEnabled, OAUTH_STATE_COOKIE } from "@/lib/auth/google";
import { signPayload } from "@/lib/security/crypto";
import { safeRedirect } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google_unavailable", env().APP_URL));
  const next = safeRedirect(new URL(req.url).searchParams.get("next"), "/account");
  const auth = createGoogleAuthorization(next);
  (await cookies()).set(OAUTH_STATE_COOKIE, signPayload({ state: auth.state, verifier: auth.verifier, next }, env().AUTH_SECRET, 600), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(auth.url);
}
