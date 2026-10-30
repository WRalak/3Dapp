import type { PaymentProvider } from "@/generated/prisma/enums";

/**
 * Provider-agnostic payment contract. Checkout only talks to this interface, so new
 * providers can be added by implementing it and registering in `registry.ts`.
 *
 * Invariant: an order is ONLY marked as paid from a verified server-to-server signal
 * (signed webhook, provider callback cross-checked with a status query, or a server-side
 * capture call) — never from a browser redirect or client response.
 */
export interface PaymentContext {
  paymentId: string;
  orderNumber: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  phone?: string | null;
  description: string;
  idempotencyKey: string;
  appUrl: string;
}

export interface InitiateResult {
  providerReference: string | null;
  status: "PENDING" | "REQUIRES_ACTION";
  /** Where to send the customer next (hosted checkout, approval page). */
  redirectUrl?: string;
  /** Human-readable instructions (e.g. "approve the prompt on your phone"). */
  instructions?: string;
  metadata?: Record<string, unknown>;
}

export type PaymentOutcome = "succeeded" | "failed" | "pending" | "ignored";

export interface VerifiedEvent {
  eventId: string;
  type: string;
  outcome: PaymentOutcome;
  paymentId?: string;
  providerReference?: string;
  amountCents?: number;
  currency?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
  /** Extra path/query context, e.g. the signed token in the M-Pesa callback URL. */
  params?: Record<string, string>;
}

export interface StatusResult {
  outcome: PaymentOutcome;
  amountCents?: number;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  providerReference?: string;
  failureReason?: string;
}

export interface StoredPayment {
  id: string;
  providerReference: string | null;
  amountCents: number;
  currency: string;
  metadata: unknown;
}

export interface PaymentAdapter {
  readonly id: PaymentProvider;
  readonly label: string;
  isEnabled(): boolean;
  initiate(ctx: PaymentContext): Promise<InitiateResult>;
  /** Must throw WebhookVerificationError if authenticity can't be established. */
  verifyWebhook(req: WebhookRequest): Promise<VerifiedEvent>;
  fetchStatus(payment: StoredPayment): Promise<StatusResult>;
  refund(payment: StoredPayment, amountCents: number, reason: string, idempotencyKey: string): Promise<RefundResult>;
}

export class WebhookVerificationError extends Error {
  constructor(message = "Webhook signature verification failed") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
