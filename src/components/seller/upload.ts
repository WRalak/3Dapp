import { sellerUploadAction } from "@/features/marketplace/actions";

/**
 * Browser → storage direct upload via a short-lived signed URL. Returns the signed claim the
 * server later verifies (key, size, content sniffing) before recording the file.
 */
export async function uploadForSeller(file: File, kind: "document" | "image"): Promise<{ ok: true; claim: string } | { ok: false; error: string }> {
  const res = await sellerUploadAction({ kind, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size });
  if (!res.ok) return { ok: false, error: res.error };
  const put = await fetch(res.data.upload.url, { method: res.data.upload.method, headers: res.data.upload.headers, body: file });
  if (!put.ok) return { ok: false, error: "Upload failed — please try again" };
  return { ok: true, claim: res.data.claim };
}
