import "server-only";
import { env } from "@/config/env";
import { signPayload } from "@/lib/security/crypto";
import { accessToken, base } from "@/features/payments/providers/mpesa";
import { ProviderError } from "@/features/payments/types";

/**
 * Payout providers. Payouts are manual by default (finance sends money and records the
 * reference). `mpesa-b2c` uses Daraja's B2C API once Safaricom approves the shortcode for
 * B2C; results arrive asynchronously at /api/payouts/mpesa/result/<signed token>.
 */
export interface PayoutProvider {
  id: "manual" | "mpesa-b2c";
  isEnabled(): boolean;
  send(input: { payoutId: string; amountCents: number; phone: string; remarks: string }): Promise<{ reference: string }>;
}

const manual: PayoutProvider = {
  id: "manual",
  isEnabled: () => true,
  async send() {
    throw new ProviderError("Manual payouts are recorded by finance staff");
  },
};

const mpesaB2c: PayoutProvider = {
  id: "mpesa-b2c",
  isEnabled: () => {
    const e = env();
    return !!(e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_B2C_INITIATOR && e.MPESA_B2C_SECURITY_CREDENTIAL && e.MPESA_CALLBACK_SECRET);
  },
  async send({ payoutId, amountCents, phone, remarks }) {
    const e = env();
    const token = signPayload({ payoutId }, e.MPESA_CALLBACK_SECRET!, 60 * 60 * 48);
    const res = await fetch(`${base()}/mpesa/b2c/v3/paymentrequest`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        OriginatorConversationID: payoutId,
        InitiatorName: e.MPESA_B2C_INITIATOR,
        SecurityCredential: e.MPESA_B2C_SECURITY_CREDENTIAL,
        CommandID: "BusinessPayment",
        // Payouts are floored to whole shillings; requestPayout only accepts whole amounts in the UI.
        Amount: Math.floor(amountCents / 100),
        PartyA: e.MPESA_SHORTCODE,
        PartyB: phone.replace(/^\+/, ""),
        Remarks: remarks.slice(0, 100),
        QueueTimeOutURL: `${e.APP_URL}/api/payouts/mpesa/timeout/${token}`,
        ResultURL: `${e.APP_URL}/api/payouts/mpesa/result/${token}`,
        Occasion: "Seller payout",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ResponseCode?: string; ConversationID?: string; errorMessage?: string };
    if (!res.ok || json.ResponseCode !== "0" || !json.ConversationID) throw new ProviderError(json.errorMessage ?? "M-Pesa B2C request failed", res.status >= 500);
    return { reference: json.ConversationID };
  },
};

const PROVIDERS = { manual, "mpesa-b2c": mpesaB2c } as const;

export function getPayoutProvider(id: keyof typeof PROVIDERS): PayoutProvider {
  return PROVIDERS[id];
}
