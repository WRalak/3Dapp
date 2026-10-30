import { hmacSha256, safeEqual } from "@/lib/security/crypto";

/**
 * Stripe-style signed payloads: header `t=<unix>,v1=<hex hmac of "t.body">`.
 * Used by the card provider (Stripe) and by the development sandbox provider.
 */
export function signTimestampedPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

export function verifyTimestampedSignature(
  secret: string,
  body: string,
  header: string | null,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k?.trim(), rest.join("=")];
    }),
  ) as Record<string, string>;
  const signatures = header
    .split(",")
    .filter((p) => p.trim().startsWith("v1="))
    .map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > toleranceSeconds) return false;
  const expected = hmacSha256(secret, `${t}.${body}`);
  return signatures.some((sig) => safeEqual(sig, expected));
}
