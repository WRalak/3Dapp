import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { redis } from "@/lib/cache/redis";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers and container orchestrators. */
export async function GET() {
  const checks: Record<string, "ok" | "down" | "disabled"> = { database: "down", redis: "disabled" };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    /* reported below */
  }
  const r = redis();
  if (r) checks.redis = r.status === "ready" ? "ok" : "down";
  const healthy = checks.database === "ok";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks, time: new Date().toISOString() }, { status: healthy ? 200 : 503 });
}
