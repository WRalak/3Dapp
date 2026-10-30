import type { PaymentProvider } from "@/generated/prisma/enums";
import type { PaymentAdapter } from "./types";
import { cardAdapter } from "./providers/card";
import { mpesaAdapter } from "./providers/mpesa";
import { paypalAdapter } from "./providers/paypal";
import { sandboxAdapter } from "./providers/sandbox";

const adapters: Record<PaymentProvider, PaymentAdapter> = {
  MPESA: mpesaAdapter,
  CARD: cardAdapter,
  PAYPAL: paypalAdapter,
  SANDBOX: sandboxAdapter,
};

export function getAdapter(provider: PaymentProvider): PaymentAdapter {
  return adapters[provider];
}

export function enabledPaymentMethods() {
  return Object.values(adapters)
    .filter((a) => a.isEnabled())
    .map((a) => ({ id: a.id, label: a.label }));
}

export function isProvider(value: string): value is PaymentProvider {
  return value in adapters;
}
