import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/config/env";
import { randomToken } from "@/lib/security/crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const OAUTH_STATE_COOKIE = "atelier_oauth";

export function googleEnabled() {
  const e = env();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  return new URL("/api/auth/google/callback", env().APP_URL).toString();
}

/** Builds the authorisation URL with state (CSRF) and PKCE (code interception) protection. */
export function createGoogleAuthorization(next: string) {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, verifier, next };
}

export async function exchangeGoogleCode(code: string, verifier: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { access_token: string };
  const info = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!info.ok) throw new Error("Google userinfo request failed");
  const profile = (await info.json()) as { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };
  if (!profile.sub || !profile.email) throw new Error("Google profile incomplete");
  return {
    provider: "google",
    providerAccountId: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: profile.email_verified === true,
    name: profile.name,
    picture: profile.picture,
  };
}
