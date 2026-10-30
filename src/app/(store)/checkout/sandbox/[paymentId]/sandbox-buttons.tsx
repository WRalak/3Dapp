"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sandboxDecisionAction } from "@/features/payments/sandbox-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-controls";

export function SandboxButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const res = await sandboxDecisionAction({ paymentId, approve });
      if (res.ok) router.push(res.data.redirectTo);
      else setError(res.error);
    });
  return (
    <div className="mt-8 space-y-3">
      <Button className="w-full" onClick={() => decide(true)} loading={pending}>
        Approve payment
      </Button>
      <Button className="w-full" variant="outline" onClick={() => decide(false)} disabled={pending}>
        Decline
      </Button>
      <FormError message={error} />
    </div>
  );
}
