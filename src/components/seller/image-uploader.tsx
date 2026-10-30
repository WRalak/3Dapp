"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { useAction } from "@/hooks/use-action";
import { sellerCompleteImageAction } from "@/features/marketplace/actions";
import { uploadForSeller } from "./upload";

const KINDS = [
  ["GALLERY", "Gallery"],
  ["FRONT", "Front"],
  ["BACK", "Back"],
  ["SIDE", "Side"],
  ["FABRIC_DETAIL", "Fabric close-up"],
] as const;

export function SellerImageUploader({ productId, productName }: { productId: string; productName: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("GALLERY");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { pending, run } = useAction();
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const up = await uploadForSeller(file, "image");
        if (!up.ok) {
          toast.error(`${file.name}: ${up.error}`);
          continue;
        }
        run(() => sellerCompleteImageAction({ claim: up.claim, productId, alt: `${productName} — ${KINDS.find((k) => k[0] === kind)![1].toLowerCase()}`, kind }));
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-auto" aria-label="Photo type">
        {KINDS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" size="sm" variant="outline" loading={busy || pending} onClick={() => input.current?.click()}>
        Upload photos
      </Button>
    </div>
  );
}
