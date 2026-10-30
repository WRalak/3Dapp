import { env } from "@/config/env";
import { ProviderError, WebhookVerificationError, type PaymentAdapter, type StoredPayment } from "../types";

/**
 * PayPal Orders v2. The buyer approves on PayPal; we capture server-to-server on return and
 * fulfil from the capture response or the verified PAYMENT.CAPTURE.* webhook (verified via
 * PayPal's verify-webhook-signature API).
 */
const base = () => (env().PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

async function token() {
  const e = env();
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new ProviderError(`PayPal auth failed (${res.status})`, true);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function paypal<T>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      authorization: `Bearer ${await token()}`,
      "content-type": "application/json",
      ...(init.requestId ? { "paypal-request-id": init.requestId } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new ProviderError(json.message ?? `PayPal error ${res.status}`, res.status >= 500);
  return json;
}

const money = (cents: number, currency: string) => ({ currency_code: currency, value: (cents / 100).toFixed(2) });

interface PayPalOrder {
  id: string;
  status: string;
  links: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
}

function captureFrom(order: PayPalOrder) {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

export async function capturePayPalOrder(orderId: string, requestId: string) {
  const order = await paypal<PayPalOrder>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: {}, requestId });
  const capture = captureFrom(order);
  return {
    outcome: capture?.status === "COMPLETED" ? ("succeeded" as const) : capture?.status === "DECLINED" ? ("failed" as const) : ("pending" as const),
    amountCents: capture ? Math.round(Number(capture.amount.value) * 100) : undefined,
    currency: capture?.amount.currency_code,
    captureId: capture?.id,
  };
}

export const paypalAdapter: PaymentAdapter = {
  id: "PAYPAL",
  label: "PayPal",
  isEnabled: () => !!(env().PAYPAL_CLIENT_ID && env().PAYPAL_CLIENT_SECRET && env().PAYPAL_WEBHOOK_ID),

  async initiate(ctx) {
    const order = await paypal<PayPalOrder>("/v2/checkout/orders", {
      requestId: ctx.idempotencyKey,
      body: {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: ctx.orderNumber, custom_id: ctx.paymentId, description: ctx.description.slice(0, 127), amount: money(ctx.amountCents, ctx.currency) }],
        application_context: {
          brand_name: "Mtindo",
          user_action: "PAY_NOW",
          return_url: `${ctx.appUrl}/api/payments/paypal/return?paymentId=${ctx.paymentId}`,
          cancel_url: `${ctx.appUrl}/orders/${ctx.orderNumber}/confirmation?cancelled=1`,
        },
      },
    });
    const approve = order.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
    if (!approve) throw new ProviderError("PayPal did not return an approval link");
    return { providerReference: order.id, status: "REQUIRES_ACTION", redirectUrl: approve.href };
  },

  async verifyWebhook(req) {
    const h = req.headers;
    const event = JSON.parse(req.rawBody) as {
      id: string;
      event_type: string;
      resource: { id: string; status?: string; custom_id?: string; amount?: { value: string; currency_code: string }; supplementary_data?: { related_ids?: { order_id?: string } } };
    };
    const verification = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      body: {
        auth_algo: h.get("paypal-auth-algo"),
        cert_url: h.get("paypal-cert-url"),
        transmission_id: h.get("paypal-transmission-id"),
        transmission_sig: h.get("paypal-transmission-sig"),
        transmission_time: h.get("paypal-transmission-time"),
        webhook_id: env().PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      },
    }).catch(() => ({ verification_status: "FAILURE" }));
    if (verification.verification_status !== "SUCCESS") throw new WebhookVerificationError();

    const r = event.resource;
    const base = {
      eventId: event.id,
      type: event.event_type,
      paymentId: r.custom_id,
      providerReference: r.supplementary_data?.related_ids?.order_id,
      amountCents: r.amount ? Math.round(Number(r.amount.value) * 100) : undefined,
      currency: r.amount?.currency_code,
      metadata: { captureId: r.id },
    };
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") return { ...base, outcome: "succeeded" };
    if (event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.DECLINED") return { ...base, outcome: "failed", failureReason: "PayPal capture denied" };
    return { ...base, outcome: "ignored" };
  },

  async fetchStatus(payment: StoredPayment) {
    if (!payment.providerReference) return { outcome: "pending" };
    const order = await paypal<PayPalOrder>(`/v2/checkout/orders/${payment.providerReference}`);
    const capture = captureFrom(order);
    if (capture?.status === "COMPLETED") return { outcome: "succeeded", amountCents: Math.round(Number(capture.amount.value) * 100), metadata: { captureId: capture.id } };
    if (order.status === "VOIDED") return { outcome: "failed", failureReason: "PayPal order voided" };
    return { outcome: "pending" };
  },

  async refund(payment, amountCents, reason, idempotencyKey) {
    const captureId = (payment.metadata as { captureId?: string } | null)?.captureId;
    if (!captureId) throw new ProviderError("Missing PayPal capture id");
    const refund = await paypal<{ id: string; status: string }>(`/v2/payments/captures/${captureId}/refund`, {
      requestId: idempotencyKey,
      body: { amount: money(amountCents, payment.currency), note_to_payer: reason.slice(0, 255) },
    });
    return { status: refund.status === "COMPLETED" ? "SUCCEEDED" : refund.status === "FAILED" ? "FAILED" : "PENDING", providerReference: refund.id };
  },
};
