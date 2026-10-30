import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { storage } from "@/lib/storage";
import { verifyPayload } from "@/lib/security/crypto";
import { route } from "@/lib/api";
import { badRequest, forbidden } from "@/lib/errors";

/**
 * Receives direct uploads for the local storage driver. Mirrors S3 presigned PUT semantics:
 * the URL carries an HMAC-signed, expiring token that pins the key, content type and size.
 */
export const PUT = route(async (req) => {
  if (env().STORAGE_DRIVER !== "local") throw forbidden();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const claims = verifyPayload<{ key: string; contentType: string; size: number }>(token, env().AUTH_SECRET);
  if (!claims) throw forbidden("Upload URL is invalid or expired");
  if (req.headers.get("content-type") !== claims.contentType) throw badRequest("Content type does not match the signed upload");
  const declared = Number(req.headers.get("content-length") ?? claims.size);
  if (declared > claims.size) throw badRequest("Upload exceeds the signed size");
  const body = Buffer.from(await req.arrayBuffer());
  if (body.byteLength !== claims.size) throw badRequest("Upload size does not match the signed size");
  await storage().write(claims.key, body, claims.contentType);
  return NextResponse.json({ ok: true });
});
