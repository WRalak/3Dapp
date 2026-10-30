import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { safeEqual } from "@/lib/security/crypto";
import { processBatch, scheduleMaintenance } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job runner for serverless deployments (e.g. Vercel Cron): call with
 * `Authorization: Bearer $CRON_SECRET`. Long-running hosts use `npm run worker` instead.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scheduleMaintenance();
  let processed = 0;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const n = await processBatch(10);
    processed += n;
    if (n === 0) break;
  }
  return NextResponse.json({ processed });
}
