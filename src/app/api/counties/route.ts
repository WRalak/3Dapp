import { NextResponse } from "next/server";
import { listCounties } from "@/server/services/delivery.service";

/** The 47 counties (public, long-cacheable). */
export async function GET() {
  const counties = await listCounties();
  return NextResponse.json(
    counties.map((c) => ({ id: c.id, name: c.name })),
    { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
