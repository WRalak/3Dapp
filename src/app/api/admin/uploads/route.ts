import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/guards";
import { limitBy } from "@/lib/security/rate-limit";
import { rateLimited } from "@/lib/errors";
import { createUpload } from "@/server/services/asset.service";

const schema = z.object({
  kind: z.enum(["image", "model"]),
  fileName: z.string().min(1).max(200),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
});

/** Issues a signed upload URL after validating the declared file against the allow-list. */
export const POST = route(async (req) => {
  const user = await requirePermission("assets.manage");
  const rl = await limitBy("upload", user.id);
  if (!rl.success) throw rateLimited();
  const input = await parseJson(req, schema);
  return NextResponse.json(await createUpload(input, user));
});
