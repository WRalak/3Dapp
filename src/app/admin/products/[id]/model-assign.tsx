"use client";

import { useState } from "react";
import { ActionButton } from "@/components/admin/admin-ui";
import { NativeSelect } from "@/components/ui/form-controls";
import type { ActionResult } from "@/lib/errors";

export function ModelAssignSelect({
  productId,
  models,
  action,
}: {
  productId: string;
  models: { id: string; label: string }[];
  action: (input: { id: string; productId: string }) => Promise<ActionResult<unknown>>;
}) {
  const [id, setId] = useState(models[0]?.id ?? "");
  return (
    <div className="flex gap-2">
      <NativeSelect value={id} onChange={(e) => setId(e.target.value)} className="h-9 text-xs" aria-label="Unassigned models">
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </NativeSelect>
      <ActionButton size="sm" variant="outline" className="h-9" action={action} input={{ id, productId }}>
        Assign
      </ActionButton>
    </div>
  );
}
