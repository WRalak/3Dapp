import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { verifyPayload } from "@/lib/security/crypto";
import { completePayout } from "@/server/services/finance.service";
import { db } from "@/lib/db/prisma";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Daraja B2C result. The path token is HMAC-signed and bound to one payout; the
 * ConversationID must match the reference stored when the payout was initiated.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const claims = verifyPayload<{ payoutId: string }>((await params).token, env().MPESA_CALLBACK_SECRET ?? "");
  if (!claims) return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  try {
    const body = (await req.json()) as { Result?: { ResultCode: number; ResultDesc: string; ConversationID: string; TransactionID?: string } };
    const r = body.Result;
    const payout = await db.sellerPayout.findUnique({ where: { id: claims.payoutId } });
    if (!r || !payout || payout.reference !== r.ConversationID) return NextResponse.json({ ResultCode: 1, ResultDesc: "Unknown payout" }, { status: 400 });
    await completePayout(payout.id, r.ResultCode === 0 ? { ok: true, reference: r.TransactionID ?? r.ConversationID } : { ok: false, reason: r.ResultDesc.slice(0, 200) }, null);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    logError(err, { where: "b2c.result" });
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Retry" }, { status: 500 });
  }
}
