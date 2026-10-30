import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { limitBy } from "@/lib/security/rate-limit";
import { rateLimited } from "@/lib/errors";
import { requestContextFrom } from "@/lib/security/request";
import { deliveryOptionsForSeller } from "@/server/services/delivery.service";

export const dynamic = "force-dynamic";

const query = z.object({ seller: z.string().min(1).max(40), county: z.string().max(40).optional(), town: z.string().max(80).optional(), amount: z.coerce.number().int().min(0).max(1e10).default(0) });

/** Public delivery quote for one seller → county/town (product pages, 3D inspect panel). */
export const GET = route(async (req) => {
  if (!(await limitBy("api", requestContextFrom(req).ip)).success) throw rateLimited();
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const options = await deliveryOptionsForSeller(q.seller, q.county || null, q.town || null, q.amount);
  return NextResponse.json({ options }, { headers: { "cache-control": "public, max-age=60" } });
});
