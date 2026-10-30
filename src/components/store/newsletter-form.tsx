"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { subscribeNewsletterAction } from "@/features/users/actions";

export function NewsletterForm({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const dark = tone === "dark";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await subscribeNewsletterAction({ email });
      if (res.ok) {
        setState({ ok: true, message: res.data.message });
        setEmail("");
      } else {
        setState({ ok: false, message: res.fieldErrors?.email?.[0] ?? res.error });
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className={`flex items-center border-b ${dark ? "border-ivory/40 focus-within:border-ivory" : "border-ink/40 focus-within:border-ink"}`}>
        <label htmlFor={`newsletter-${tone}`} className="sr-only">
          Email address
        </label>
        <input
          id={`newsletter-${tone}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className={`h-12 flex-1 bg-transparent text-sm outline-none ${dark ? "placeholder:text-stone" : "placeholder:text-taupe"}`}
          aria-invalid={state?.ok === false || undefined}
        />
        <button type="submit" disabled={pending} className="p-2 disabled:opacity-40" aria-label="Subscribe">
          <ArrowRight className="size-4" />
        </button>
      </div>
      <p role="status" className={`mt-3 min-h-4 text-xs ${state?.ok === false ? "text-red-300" : dark ? "text-stone" : "text-taupe"}`}>
        {pending ? "Subscribing…" : state?.message ?? "Editorial notes and early access. No spam."}
      </p>
    </form>
  );
}
