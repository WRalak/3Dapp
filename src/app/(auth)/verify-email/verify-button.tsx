"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { verifyEmailAction } from "@/features/auth/verify-action";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/ui/form-controls";

export function VerifyEmailButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  if (result?.ok)
    return (
      <div className="space-y-6">
        <FormSuccess message={result.message} />
        <Button asChild>
          <Link href="/account">Go to my account</Link>
        </Button>
      </div>
    );
  return (
    <div className="space-y-4">
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await verifyEmailAction({ token });
            setResult(res.ok ? { ok: true, message: "Your email is confirmed." } : { ok: false, message: res.error });
          })
        }
      >
        Confirm my email
      </Button>
      <FormError message={result && !result.ok ? result.message : null} />
    </div>
  );
}
