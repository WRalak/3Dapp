import { env } from "@/config/env";
import { verifyTimestampedSignature } from "../signatures";
import { ProviderError, WebhookVerificationError, type PaymentAdapter, type StoredPayment } from "../types";

/**
 * Card payments via Stripe Checkout (REST API, no SDK dependency).
 * Card data never touches our servers (PCI SAQ-A): customers pay on Stripe's hosted page
 * and fulfilment is driven solely by the signed `checkout.session.*` webhooks.
 */
const API = "https://api.stripe.com/v1";

async function stripe<T>(path: string, init: { method?: string; body?: Record<string, string>; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      authorization: `Bearer ${env().STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body ? new URLSearchParams(init.body) : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new ProviderError(json.error?.message ?? `Stripe error ${res.status}`, res.status >= 500);
  return json;
}

interface CheckoutSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  payment_intent: string | null;
}

function zeroDecimal(currency: string) {
  return ["JPY", "KRW", "VND", "CLP", "XOF", "XAF", "UGX", "RWF"].includes(currency.toUpperCase());
}
const toStripe = (cents: number, currency: string) => (zeroDecimal(currency) ? Math.round(cents / 100) : cents);
const fromStripe = (amount: number, currency: string) => (zeroDecimal(currency) ? amount * 100 : amount);

export const cardAdapter: PaymentAdapter = {
  id: "CARD",
  label: "Card",
  isEnabled: () => !!(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET),

  async initiate(ctx) {
    const session = await stripe<CheckoutSession>("/checkout/sessions", {
      idempotencyKey: ctx.idempotencyKey,
      body: {
        mode: "payment",
        client_reference_id: ctx.paymentId,
        customer_email: ctx.customerEmail,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": ctx.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(toStripe(ctx.amountCents, ctx.currency)),
        "line_items[0][price_data][product_data][name]": ctx.description,
        "metadata[paymentId]": ctx.paymentId,
        "metadata[orderNumber]": ctx.orderNumber,
        success_url: `${ctx.appUrl}/orders/${ctx.orderNumber}/confirmation`,
        cancel_url: `${ctx.appUrl}/orders/${ctx.orderNumber}/confirmation?cancelled=1`,
        expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      },
    });
    if (!session.url) throw new ProviderError("Stripe did not return a checkout URL");
    return { providerReference: session.id, status: "REQUIRES_ACTION", redirectUrl: session.url };
  },

  async verifyWebhook(req) {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret || !verifyTimestampedSignature(secret, req.rawBody, req.headers.get("stripe-signature"))) {
      throw new WebhookVerificationError();
    }
    const event = JSON.parse(req.rawBody) as { id: string; type: string; data: { object: CheckoutSession } };
    const s = event.data.object;
    const base = {
      eventId: event.id,
      type: event.type,
      paymentId: s.client_reference_id ?? undefined,
      providerReference: s.id,
      amountCents: typeof s.amount_total === "number" ? fromStripe(s.amount_total, s.currency) : undefined,
      currency: s.currency?.toUpperCase(),
      metadata: { paymentIntent: s.payment_intent },
    };
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return { ...base, outcome: s.payment_status === "paid" ? "succeeded" : "pending" };
      case "checkout.session.async_payment_failed":
        return { ...base, outcome: "failed", failureReason: "Card payment failed" };
      case "checkout.session.expired":
        return { ...base, outcome: "failed", failureReason: "Checkout session expired" };
      default:
        return { ...base, outcome: "ignored" };
    }
  },

  async fetchStatus(payment: StoredPayment) {
    if (!payment.providerReference) return { outcome: "pending" };
    const s = await stripe<CheckoutSession>(`/checkout/sessions/${payment.providerReference}`);
    if (s.payment_status === "paid") return { outcome: "succeeded", amountCents: fromStripe(s.amount_total, s.currency), metadata: { paymentIntent: s.payment_intent } };
    if (s.status === "expired") return { outcome: "failed", failureReason: "Checkout session expired" };
    return { outcome: "pending" };
  },

  async refund(payment, amountCents, reason, idempotencyKey) {
    const intent = (payment.metadata as { paymentIntent?: string } | null)?.paymentIntent;
    if (!intent) throw new ProviderError("Missing payment intent for refund");
    const refund = await stripe<{ id: string; status: string }>("/refunds", {
      idempotencyKey,
      body: {
        payment_intent: intent,
        amount: String(toStripe(amountCents, payment.currency)),
        reason: "requested_by_customer",
        "metadata[note]": reason.slice(0, 400),
      },
    });
    return { status: refund.status === "succeeded" ? "SUCCEEDED" : refund.status === "failed" ? "FAILED" : "PENDING", providerReference: refund.id };
  },
};
