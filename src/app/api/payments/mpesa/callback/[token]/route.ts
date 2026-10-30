import { NextResponse } from "next/server";
import { processWebhook } from "@/server/services/payment.service";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Daraja STK Push result callback. The signed token in the path binds it to one payment. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > 64 * 1024) return NextResponse.json({ ResultCode: 1, ResultDesc: "Too large" }, { status: 413 });
    const result = await processWebhook("MPESA", { rawBody, headers: req.headers, params: { token: (await params).token } });
    // Daraja expects a ResultCode acknowledgement.
    return NextResponse.json({ ResultCode: result.status === 200 ? 0 : 1, ResultDesc: result.status === 200 ? "Accepted" : "Rejected" }, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
