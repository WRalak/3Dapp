import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/guards";
import { readSellerDocument } from "@/server/services/seller.service";

export const dynamic = "force-dynamic";

/** Verification documents are private: streamed only to staff with sellers.view, audited on every view. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requirePermission("sellers.view");
  const { doc, body } = await readSellerDocument((await ctx.params).id, user);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": doc.contentType,
      "content-length": String(body.byteLength),
      "content-disposition": `inline; filename="${doc.fileName.replace(/[^\w.-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
