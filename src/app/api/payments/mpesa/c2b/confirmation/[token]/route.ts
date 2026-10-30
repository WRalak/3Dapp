import { NextResponse } from "next/server";
import { verifyC2bRequest, type C2bPayload } from "@/features/payments/providers/mpesa-c2b";
import { confirmC2b } from "@/server/services/payment.service";
import { requestContextFrom } from "@/lib/security/request";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Daraja C2B confirmation: money has moved. Idempotent on TransID. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!verifyC2bRequest((await params).token, requestContextFrom(req).ip)) return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 16 * 1024) return NextResponse.json({ ResultCode: 1, ResultDesc: "Too large" }, { status: 413 });
    await confirmC2b(JSON.parse(raw) as C2bPayload);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    logError(err, { where: "c2b.confirmation" });
    // Non-200 makes Safaricom retry; the TransID dedupe keeps retries safe.
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Retry" }, { status: 500 });
  }
}
