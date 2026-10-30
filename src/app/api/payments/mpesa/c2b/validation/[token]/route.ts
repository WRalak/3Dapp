import { NextResponse } from "next/server";
import { verifyC2bRequest, type C2bPayload } from "@/features/payments/providers/mpesa-c2b";
import { validateC2b } from "@/server/services/payment.service";
import { requestContextFrom } from "@/lib/security/request";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Daraja C2B validation: accept only payments that match an open order exactly. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!verifyC2bRequest((await params).token, requestContextFrom(req).ip)) return NextResponse.json({ ResultCode: "C2B00016", ResultDesc: "Rejected" }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 16 * 1024) return NextResponse.json({ ResultCode: "C2B00016", ResultDesc: "Rejected" }, { status: 413 });
    const result = await validateC2b(JSON.parse(raw) as C2bPayload);
    return NextResponse.json({ ResultCode: result.code, ResultDesc: result.reason });
  } catch (err) {
    logError(err, { where: "c2b.validation" });
    return NextResponse.json({ ResultCode: "C2B00016", ResultDesc: "Rejected" });
  }
}
