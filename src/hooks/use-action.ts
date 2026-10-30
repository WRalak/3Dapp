"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";

/** Runs a Server Action, toasts its message/error and refreshes server components on success. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void, onError?: (res: Extract<ActionResult<T>, { ok: false }>) => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        const msg = (res.data as { message?: string } | undefined)?.message;
        if (msg) toast.success(msg);
        onOk?.(res.data);
        router.refresh();
      } else {
        toast.error(res.error);
        onError?.(res);
      }
    });
  return { pending, run };
}
