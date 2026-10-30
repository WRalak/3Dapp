import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { verifyPayload } from "@/lib/security/crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** B2C queue timeout: the payout stays PROCESSING for finance to check on the M-Pesa portal. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const claims = verifyPayload<{ payoutId: string }>((await params).token, env().MPESA_CALLBACK_SECRET ?? "");
  if (!claims) return NextResponse.json({ ResultCode: 1 }, { status: 403 });
  logger.warn({ payoutId: claims.payoutId }, "M-Pesa B2C request timed out in queue");
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
