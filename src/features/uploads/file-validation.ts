/**
 * Upload allow-lists. A file must pass extension, declared MIME type, size AND magic-byte
 * checks; anything else (executables, scripts, SVG with embedded script, archives) is rejected.
 */
export const UPLOAD_KINDS = {
  image: {
    maxBytes: 10 * 1024 * 1024,
    types: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
    },
  },
  model: {
    maxBytes: 40 * 1024 * 1024,
    types: {
      "model/gltf-binary": [".glb"],
      "model/gltf+json": [".gltf"],
      "application/octet-stream": [".glb"],
    },
  },
  /** Seller verification documents — stored under the private/ prefix, never served publicly. */
  document: {
    maxBytes: 8 * 1024 * 1024,
    types: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

export function validateDeclaredFile(kind: UploadKind, fileName: string, contentType: string, size: number): string | null {
  const rules = UPLOAD_KINDS[kind];
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  const allowed = (rules.types as Record<string, readonly string[]>)[contentType];
  if (!ext || !allowed) return `File type ${contentType || "unknown"} is not allowed`;
  if (!allowed.includes(ext)) return `Extension ${ext} does not match ${contentType}`;
  if (size <= 0) return "File is empty";
  if (size > rules.maxBytes) return `File exceeds ${rules.maxBytes / 1048576} MB`;
  return null;
}

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/** Verifies the file's real content type from its leading bytes. */
export function sniffImage(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/avif" | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = new TextDecoder().decode(buf.subarray(8, 12));
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

export function sniffDocument(buf: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  const img = sniffImage(buf);
  return img === "image/jpeg" || img === "image/png" ? img : null;
}

export function sanitizeFileName(name: string) {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  return `${base.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file"}${ext}`;
}
