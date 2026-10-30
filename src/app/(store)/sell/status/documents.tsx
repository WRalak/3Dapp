"use client";

import { useRef, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/misc";
import { useAction } from "@/hooks/use-action";
import { addSellerDocumentAction, removeSellerDocumentAction } from "@/features/marketplace/actions";
import { uploadForSeller } from "@/components/seller/upload";

const TYPES = [
  ["NATIONAL_ID", "National ID / passport"],
  ["KRA_PIN", "KRA PIN certificate"],
  ["BUSINESS_REGISTRATION", "Business registration (BRS)"],
  ["OTHER", "Other"],
] as const;

export function SellerDocuments({ documents, editable }: { documents: { id: string; type: string; fileName: string; status: string; note: string | null }[]; editable: boolean }) {
  const [type, setType] = useState<(typeof TYPES)[number][0]>("NATIONAL_ID");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadForSeller(file, "document");
      if (!up.ok) return void toast.error(up.error);
      run(() => addSellerDocumentAction({ claim: up.claim, type }));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y border-y">
        {documents.length === 0 && <li className="py-4 text-sm text-taupe">No documents yet.</li>}
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">
                {TYPES.find((t) => t[0] === d.type)?.[1] ?? d.type} · <span className="text-taupe">{d.fileName}</span>
                {d.note && <span className="block text-xs text-taupe">{d.note}</span>}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={d.status === "ACCEPTED" ? "success" : d.status === "REJECTED" ? "danger" : "neutral"}>{d.status.toLowerCase()}</Badge>
              {editable && d.status !== "ACCEPTED" && (
                <button type="button" aria-label={`Remove ${d.fileName}`} disabled={pending} onClick={() => run(() => removeSellerDocumentAction({ id: d.id }))}>
                  <Trash2 className="size-4 text-taupe hover:text-danger" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-auto" aria-label="Document type">
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" loading={busy || pending} onClick={() => input.current?.click()}>
            Upload PDF or photo
          </Button>
          <p className="w-full text-xs text-taupe">Documents are stored privately and only seen by our verification team. Max 8 MB.</p>
        </div>
      )}
    </div>
  );
}
