"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, MessageCircle, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { useAction } from "@/hooks/use-action";
import { followSellerAction, reportProductAction, sendInquiryAction } from "@/features/marketplace/actions";

function useSignInGate(signedIn: boolean) {
  const router = useRouter();
  return () => {
    if (signedIn) return true;
    router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    return false;
  };
}

export function FollowButton({ sellerId, following, signedIn, size = "sm" }: { sellerId: string; following: boolean; signedIn: boolean; size?: "sm" | "md" }) {
  const { pending, run } = useAction();
  const [on, setOn] = useState(following);
  const gate = useSignInGate(signedIn);
  return (
    <Button
      size={size}
      variant={on ? "outline" : "primary"}
      loading={pending}
      aria-pressed={on}
      onClick={() => gate() && run(() => followSellerAction({ sellerId, follow: !on }), (d) => setOn(d.following))}
    >
      {on ? <UserCheck /> : <UserPlus />} {on ? "Following" : "Follow"}
    </Button>
  );
}

export function ContactSeller({ sellerId, sellerName, productId, signedIn }: { sellerId: string; sellerName: string; productId?: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(productId ? "Question about this piece" : "");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const { pending, run } = useAction();
  const gate = useSignInGate(signedIn);
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? gate() && setOpen(true) : setOpen(false))}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <MessageCircle /> Ask the designer
        </Button>
      </DialogTrigger>
      <DialogContent title={`Message ${sellerName}`} description="Ask about sizing, custom fits, fabric or delivery. Replies arrive in your account.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => sendInquiryAction({ sellerId, productId, subject, message }),
              () => (setOpen(false), setMessage("")),
              (r) => setErrors(r.fieldErrors ?? {}),
            );
          }}
        >
          <Field label="Subject" error={errors.subject?.[0]}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Message" error={errors.message?.[0]}>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
          </Field>
          <p className="text-xs text-taupe">For your safety, keep payments on Mtindo — never send money directly to a seller.</p>
          <Button type="submit" loading={pending} className="w-full">
            Send message
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REASONS = [
  ["COUNTERFEIT", "Counterfeit or fake brand"],
  ["MISLEADING", "Misleading photos or description"],
  ["INTELLECTUAL_PROPERTY", "Copies someone else's design"],
  ["OFFENSIVE", "Offensive or culturally disrespectful"],
  ["PROHIBITED", "Prohibited item"],
  ["OTHER", "Something else"],
] as const;

export function ReportProduct({ productId, signedIn }: { productId: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("MISLEADING");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const gate = useSignInGate(signedIn);
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? gate() && setOpen(true) : setOpen(false))}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-taupe underline-offset-4 hover:text-ink hover:underline">
          <Flag className="size-3" /> Report this listing
        </button>
      </DialogTrigger>
      <DialogContent title="Report this listing">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => reportProductAction({ productId, reason, details }), () => setOpen(false), (r) => setError(r.error));
          }}
        >
          <Field label="What's wrong?">
            <NativeSelect value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Details (optional)">
            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
          </Field>
          <FormError message={error} />
          <Button type="submit" loading={pending} className="w-full">
            Send report
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
