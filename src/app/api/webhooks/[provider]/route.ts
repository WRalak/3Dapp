import { NextResponse } from "next/server";
import { isProvider } from "@/features/payments/registry";
import { processWebhook } from "@/server/services/payment.service";
import { limitBy } from "@/lib/security/rate-limit";
import { requestContextFrom } from "@/lib/security/request";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

const PATHS: Record<string, "CARD" | "PAYPAL" | "SANDBOX"> = { card: "CARD", stripe: "CARD", paypal: "PAYPAL", sandbox: "SANDBOX" };

/**
 * Provider webhooks. Signature verification uses the *raw* body, so we read text and never
 * re-serialise. Not CSRF-checked (server-to-server) — authenticity comes from the signature.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = PATHS[(await params).provider.toLowerCase()];
    if (!provider || !isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
    const rl = await limitBy("webhook", `${provider}:${requestContextFrom(req).ip}`);
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    const rawBody = await req.text();
    if (rawBody.length > 512 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const result = await processWebhook(provider, { rawBody, headers: req.headers });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
