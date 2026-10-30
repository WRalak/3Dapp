import { env } from "@/config/env";
import { signPayload, verifyPayload } from "@/lib/security/crypto";
import { ProviderError, WebhookVerificationError, type PaymentAdapter, type StoredPayment } from "../types";

/**
 * M-Pesa Express (STK Push) via Safaricom Daraja.
 *
 * Daraja callbacks are not signed, so authenticity is established in layers:
 *  1. The callback URL embeds an HMAC-signed, expiring token bound to our payment id.
 *  2. The CheckoutRequestID must match the reference we stored when initiating.
 *  3. Success is confirmed with a server-to-server STK Push Query before fulfilment,
 *     and the paid amount must match the order total.
 */
const base = () => (env().MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");

let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const e = env();
  const basic = Buffer.from(`${e.MPESA_CONSUMER_KEY}:${e.MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { authorization: `Basic ${basic}` } });
  if (!res.ok) throw new ProviderError(`M-Pesa auth failed (${res.status})`, true);
  const json = (await res.json()) as { access_token: string; expires_in: string };
  tokenCache = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in) * 1000 };
  return json.access_token;
}

function timestamp(d = new Date()) {
  // Daraja expects YYYYMMDDHHmmss in East Africa Time (UTC+3).
  const eat = new Date(d.getTime() + 3 * 3600_000);
  return eat.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function password(ts: string) {
  const e = env();
  return Buffer.from(`${e.MPESA_SHORTCODE}${e.MPESA_PASSKEY}${ts}`).toString("base64");
}

/** Converts the store amount to whole Kenyan shillings. */
export function toKes(amountCents: number, currency: string) {
  if (currency === "KES") return Math.ceil(amountCents / 100);
  const rate = env().MPESA_KES_RATE;
  if (!rate) throw new ProviderError("MPESA_KES_RATE must be configured when the store currency is not KES");
  return Math.ceil((amountCents / 100) * rate);
}

export function normaliseMsisdn(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

async function stkQuery(checkoutRequestId: string) {
  const ts = timestamp();
  const res = await fetch(`${base()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: env().MPESA_SHORTCODE, Password: password(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const json = (await res.json()) as { ResultCode?: string; ResultDesc?: string; errorMessage?: string };
  if (json.ResultCode === "0") return { outcome: "succeeded" as const };
  if (json.ResultCode !== undefined) return { outcome: "failed" as const, failureReason: json.ResultDesc };
  return { outcome: "pending" as const };
}

export const mpesaAdapter: PaymentAdapter = {
  id: "MPESA",
  label: "M-Pesa",
  isEnabled: () => {
    const e = env();
    return !!(e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_PASSKEY && e.MPESA_CALLBACK_SECRET && (e.STORE_CURRENCY === "KES" || e.MPESA_KES_RATE));
  },

  async initiate(ctx) {
    if (!ctx.phone) throw new ProviderError("A Safaricom phone number is required");
    const e = env();
    const ts = timestamp();
    const token = signPayload({ pid: ctx.paymentId }, e.MPESA_CALLBACK_SECRET!, 60 * 60 * 24);
    const amount = toKes(ctx.amountCents, ctx.currency);
    const res = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: e.MPESA_SHORTCODE,
        Password: password(ts),
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: normaliseMsisdn(ctx.phone),
        PartyB: e.MPESA_SHORTCODE,
        PhoneNumber: normaliseMsisdn(ctx.phone),
        CallBackURL: `${ctx.appUrl}/api/payments/mpesa/callback/${token}`,
        AccountReference: ctx.orderNumber.slice(0, 12),
        TransactionDesc: `Order ${ctx.orderNumber}`.slice(0, 13),
      }),
    });
    const json = (await res.json()) as { ResponseCode?: string; CheckoutRequestID?: string; CustomerMessage?: string; errorMessage?: string };
    if (!res.ok || json.ResponseCode !== "0" || !json.CheckoutRequestID) {
      throw new ProviderError(json.errorMessage ?? json.CustomerMessage ?? "M-Pesa request failed", res.status >= 500);
    }
    return {
      providerReference: json.CheckoutRequestID,
      status: "PENDING",
      instructions: "Check your phone and enter your M-Pesa PIN to approve the payment.",
      metadata: { amountKes: amount, msisdn: normaliseMsisdn(ctx.phone) },
    };
  },

  async verifyWebhook(req) {
    const claims = verifyPayload<{ pid: string }>(req.params?.token ?? "", env().MPESA_CALLBACK_SECRET ?? "");
    if (!claims) throw new WebhookVerificationError("Invalid M-Pesa callback token");
    const body = JSON.parse(req.rawBody) as {
      Body?: { stkCallback?: { CheckoutRequestID: string; ResultCode: number; ResultDesc: string; CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] } } };
    };
    const cb = body.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) throw new WebhookVerificationError("Malformed M-Pesa callback");
    const items = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
    let outcome: "succeeded" | "failed" = cb.ResultCode === 0 ? "succeeded" : "failed";
    let failureReason = cb.ResultCode === 0 ? undefined : cb.ResultDesc;
    if (outcome === "succeeded") {
      // Never trust the callback alone — confirm with Safaricom.
      const confirmed = await stkQuery(cb.CheckoutRequestID);
      if (confirmed.outcome !== "succeeded") {
        outcome = "failed";
        failureReason = "Payment could not be confirmed with M-Pesa";
      }
    }
    return {
      eventId: `${cb.CheckoutRequestID}:${cb.ResultCode}`,
      type: "stk.callback",
      outcome,
      paymentId: claims.pid,
      providerReference: cb.CheckoutRequestID,
      failureReason,
      metadata: { receipt: items.MpesaReceiptNumber, amountKes: items.Amount, phone: items.PhoneNumber },
    };
  },

  async fetchStatus(payment: StoredPayment) {
    if (!payment.providerReference) return { outcome: "pending" };
    return stkQuery(payment.providerReference);
  },

  async refund() {
    // Reversals require the Daraja Reversal API with initiator credentials and are
    // asynchronous; they are recorded as pending and completed by finance staff.
    return { status: "PENDING", failureReason: "M-Pesa reversal must be completed from the M-Pesa org portal" };
  },
};
