"use client";

import { useState } from "react";
import { ActionButton } from "@/components/admin/admin-ui";
import { NativeSelect } from "@/components/ui/form-controls";
import { assignModelAction } from "@/features/admin/actions";

/** Assigns a validated model to a product that has no model yet. */
export function AssignToProduct({ assetId, products }: { assetId: string; products: { id: string; name: string }[] }) {
  const [productId, setProductId] = useState("");
  return (
    <div className="flex gap-1">
      <NativeSelect value={productId} onChange={(e) => setProductId(e.target.value)} className="h-8 w-40 text-xs" aria-label="Assign to product">
        <option value="">Assign to…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <ActionButton size="sm" variant="outline" className="h-8" disabled={!productId} action={assignModelAction} input={{ id: assetId, productId }}>
        Assign
      </ActionButton>
    </div>
  );
}
