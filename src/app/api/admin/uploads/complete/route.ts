import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseJson, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/guards";
import { completeImageUpload, completeModelUpload } from "@/server/services/asset.service";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    claim: z.string().min(10),
    productId: z.string().min(1),
    alt: z.string().trim().min(1).max(200),
    imageKind: z.enum(["GALLERY", "FRONT", "BACK", "SIDE", "FABRIC_DETAIL"]).default("GALLERY"),
    color: z.string().max(40).optional(),
  }),
  z.object({
    kind: z.literal("model"),
    claim: z.string().min(10),
    name: z.string().trim().max(120).optional(),
    productId: z.string().optional().nullable(),
  }),
]);

/** Confirms an upload: verifies real file content (magic bytes / glTF parse) before registering it. */
export const POST = route(async (req) => {
  const user = await requirePermission("assets.manage");
  const input = await parseJson(req, schema);
  if (input.kind === "image") {
    const image = await completeImageUpload({ claim: input.claim, productId: input.productId, alt: input.alt, kind: input.imageKind, color: input.color }, user);
    revalidatePath(`/admin/products/${input.productId}`);
    return NextResponse.json({ image });
  }
  const asset = await completeModelUpload({ claim: input.claim, name: input.name, productId: input.productId }, user);
  revalidatePath("/admin/3d-assets");
  return NextResponse.json({ asset });
});
