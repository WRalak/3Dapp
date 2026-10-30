import "server-only";
import { env } from "@/config/env";
import { hmacSha256, safeEqual } from "@/lib/security/crypto";
import { accessToken, base } from "./mpesa";

/**
 * M-Pesa C2B (Paybill/Till) — customers pay from the SIM menu or app using the order number
 * as the account number. Safaricom calls our validation + confirmation URLs, which are
 * registered once per shortcode. C2B callbacks carry no signature, so we:
 *  1. embed an unguessable HMAC path secret in the registered URLs,
 *  2. optionally allow-list Safaricom's callback IPs (MPESA_ALLOWED_IPS),
 *  3. dedupe on the M-Pesa receipt (TransID) and match amount + account to an open order.
 */
export function c2bPathSecret() {
  const secret = env().MPESA_CALLBACK_SECRET;
  if (!secret) throw new Error("MPESA_CALLBACK_SECRET is not configured");
  return hmacSha256(secret, "mpesa-c2b-v1", "base64url").slice(0, 32);
}

export function verifyC2bRequest(token: string, ip: string) {
  let expected: string;
  try {
    expected = c2bPathSecret();
  } catch {
    return false;
  }
  if (!safeEqual(token, expected)) return false;
  const allow = env().MPESA_ALLOWED_IPS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return allow.length === 0 || allow.includes(ip);
}

export interface C2bPayload {
  TransactionType?: string;
  TransID: string;
  TransTime?: string;
  TransAmount: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
}

export function c2bEnabled() {
  const e = env();
  return !!(e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && (e.MPESA_C2B_SHORTCODE || e.MPESA_SHORTCODE) && e.MPESA_CALLBACK_SECRET);
}

/** One-off: tells Safaricom where to send C2B validation/confirmation for our shortcode. */
export async function registerC2bUrls() {
  const e = env();
  const token = c2bPathSecret();
  const res = await fetch(`${base()}/mpesa/c2b/v2/registerurl`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      ShortCode: e.MPESA_C2B_SHORTCODE ?? e.MPESA_SHORTCODE,
      ResponseType: "Cancelled", // reject payments when validation is unreachable
      ConfirmationURL: `${e.APP_URL}/api/payments/mpesa/c2b/confirmation/${token}`,
      ValidationURL: `${e.APP_URL}/api/payments/mpesa/c2b/validation/${token}`,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ResponseCode?: string; ResponseDescription?: string; errorMessage?: string };
  if (!res.ok || json.ResponseCode !== "0") throw new Error(json.errorMessage ?? json.ResponseDescription ?? `Registration failed (${res.status})`);
  return json.ResponseDescription ?? "Registered";
}
