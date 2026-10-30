"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

type Kind = "image" | "model";

const ACCEPT: Record<Kind, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif",
  model: ".glb,.gltf,model/gltf-binary,model/gltf+json",
};

function contentTypeFor(file: File, kind: Kind) {
  if (kind === "image") return file.type;
  if (file.name.toLowerCase().endsWith(".gltf")) return "model/gltf+json";
  return "model/gltf-binary";
}

/** Builds the confirmation payload; images get a view tag inferred from the file name. */
function completeBody(file: File, kind: Kind, productId?: string, productName?: string): Record<string, unknown> {
  const base = file.name.replace(/\.[^.]+$/, "");
  if (kind === "model") return { name: file.name, productId: productId ?? null };
  const imageKind = /fabric|detail|texture/i.test(base) ? "FABRIC_DETAIL" : /back/i.test(base) ? "BACK" : /side/i.test(base) ? "SIDE" : /front/i.test(base) ? "FRONT" : "GALLERY";
  return { productId, alt: `${productName ?? "Product"} — ${base.replace(/[-_]+/g, " ")}`.slice(0, 200), imageKind };
}

/**
 * Direct-to-storage upload: (1) ask the server for a signed URL — it validates type and size,
 * (2) PUT the file straight to storage, (3) confirm — the server re-checks the real bytes.
 */
export function Uploader({ kind, productId, productName, label, multiple }: { kind: Kind; productId?: string; productName?: string; label: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);

  const uploadOne = async (file: File) => {
    const contentType = contentTypeFor(file, kind);
    const { upload, claim } = await api<{ upload: { url: string; method: "PUT"; headers: Record<string, string> }; claim: string }>("/api/admin/uploads", {
      method: "POST",
      json: { kind, fileName: file.name, contentType, size: file.size },
    });
    setProgress(`Uploading ${file.name} (${formatBytes(file.size)})…`);
    const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    setProgress(kind === "model" ? `Validating ${file.name}…` : `Processing ${file.name}…`);
    return api<{ asset?: { status: string; errorMessage: string | null } }>("/api/admin/uploads/complete", { method: "POST", json: { kind, claim, ...completeBody(file, kind, productId, productName) } });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const res = await uploadOne(file);
        if (res.asset && res.asset.status !== "READY") toast.error(`${file.name} was rejected: ${res.asset.errorMessage ?? res.asset.status}`);
        else toast.success(`${file.name} uploaded`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept={ACCEPT[kind]} multiple={multiple} className="sr-only" id={`upload-${kind}`} onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" variant="outline" size="sm" loading={!!progress} onClick={() => input.current?.click()}>
        <Upload /> {label}
      </Button>
      {progress && (
        <span className="text-xs text-taupe" role="status">
          {progress}
        </span>
      )}
    </div>
  );
}
