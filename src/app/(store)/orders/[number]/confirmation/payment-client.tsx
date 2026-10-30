"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { retryPaymentAction } from "@/features/orders/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

/** Polls the server (which may query the provider) until the payment settles. */
export function PaymentWatcher({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["payment-status", paymentId],
    queryFn: () => api<{ paymentStatus: string; orderStatus: string; failureReason: string | null }>(`/api/payments/${paymentId}/status`),
    refetchInterval: (q) => (q.state.data && !["PENDING", "REQUIRES_ACTION"].includes(q.state.data.paymentStatus) ? false : 4000),
  });
  useEffect(() => {
    if (data && !["PENDING", "REQUIRES_ACTION"].includes(data.paymentStatus)) router.refresh();
  }, [data, router]);
  return (
    <p className="mt-8 flex items-center justify-center gap-2 text-sm text-taupe" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" /> Checking payment status…
    </p>
  );
}

export function RetryPayment({ orderNumber, methods }: { orderNumber: string; methods: { id: "MPESA" | "CARD" | "PAYPAL" | "SANDBOX"; label: string }[] }) {
  const router = useRouter();
  const [method, setMethod] = useState(methods[0]?.id);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!method) return null;

  const retry = () =>
    start(async () => {
      setError(null);
      const res = await retryPaymentAction({ orderNumber, paymentMethod: method, mpesaPhone: phone || undefined });
      if (!res.ok) return setError(res.error);
      if (res.data.instructions) setInfo(res.data.instructions);
      if (/^https?:\/\//.test(res.data.redirectTo)) window.location.assign(res.data.redirectTo);
      else router.push(res.data.redirectTo);
    });

  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 border p-6">
      <p className="eyebrow">Retry payment</p>
      <div className="grid gap-2">
        {methods.map((m) => (
          <button key={m.id} type="button" onClick={() => setMethod(m.id)} className={cn("border p-3 text-left text-sm", method === m.id && "border-ink")} aria-pressed={method === m.id}>
            {m.label}
          </button>
        ))}
      </div>
      {method === "MPESA" && <Input placeholder="M-Pesa number (07XX…)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="M-Pesa phone number" />}
      <FormError message={error} />
      {info && <p className="text-sm text-graphite">{info}</p>}
      <Button className="w-full" onClick={retry} loading={pending}>
        Pay now
      </Button>
    </div>
  );
}
