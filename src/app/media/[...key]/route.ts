import { env } from "@/config/env";
import { storage, assertSafeKey } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/** Serves locally stored uploads (local storage driver only). S3/R2 files are served by the bucket/CDN. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (env().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const key = (await params).key.join("/");
  const ext = key.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const type = TYPES[ext];
  try {
    assertSafeKey(key);
    if (key.startsWith("private/")) throw new Error("private");
    if (!type) throw new Error("type");
    const body = await storage().read(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": type,
        "content-length": String(body.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
