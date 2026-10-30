"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { useAction } from "@/hooks/use-action";
import { confirmPhoneAction, startPhoneVerificationAction } from "@/features/marketplace/actions";

/** SMS one-time-code verification of the customer's Kenyan mobile number. */
export function PhoneVerification({ phone, verified }: { phone: string | null; verified: boolean }) {
  const [value, setValue] = useState(phone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(!verified);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const { pending, run } = useAction();
  if (!editing)
    return (
      <p className="flex items-center gap-2 text-sm">
        <BadgeCheck className="size-4 text-success" /> {phone} is verified.
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => (setEditing(true), setValue(""), setCode(""))}>
          Change
        </button>
      </p>
    );
  return (
    <div className="max-w-sm space-y-3">
      {!sent ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => startPhoneVerificationAction({ phone: value }), () => setSent(true), (r) => setErrors(r.fieldErrors ?? {}));
          }}
        >
          <Field label="Mobile number" error={errors.phone?.[0]} className="flex-1">
            <Input type="tel" inputMode="tel" placeholder="07XX XXX XXX" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Button type="submit" loading={pending}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => confirmPhoneAction({ code }), () => (setSent(false), setEditing(false)), (r) => setErrors(r.fieldErrors ?? {}));
          }}
        >
          <Field label="6-digit code" error={errors.code?.[0]} className="flex-1">
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" loading={pending}>
            Verify
          </Button>
        </form>
      )}
    </div>
  );
}
