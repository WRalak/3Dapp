"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
import { reviewSchema } from "@/lib/validation/account";
import { submitReviewAction } from "@/features/users/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import type { z } from "zod";

type Values = z.input<typeof reviewSchema>;

export function ReviewForm({ productId, signedIn }: { productId: string; signedIn: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(reviewSchema), defaultValues: { productId, rating: 5, title: "", body: "" } });
  const rating = Number(form.watch("rating"));

  if (!signedIn) {
    return (
      <p className="text-sm text-graphite">
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>{" "}
        to write a review.
      </p>
    );
  }
  if (result?.ok) return <FormSuccess message={result.message} />;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await submitReviewAction(values);
    if (res.ok) setResult({ ok: true, message: res.data.message });
    else setResult({ ok: false, message: res.error });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="eyebrow text-graphite">Write a review</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => form.setValue("rating", n)}>
            <Star className={cn("size-5", n <= rating ? "fill-ink text-ink" : "text-stone")} />
          </button>
        ))}
      </div>
      <Field label="Title" error={form.formState.errors.title?.message}>
        <Input {...form.register("title")} />
      </Field>
      <Field label="Review" error={form.formState.errors.body?.message}>
        <Textarea {...form.register("body")} />
      </Field>
      <FormError message={result && !result.ok ? result.message : null} />
      <Button type="submit" loading={form.formState.isSubmitting}>
        Submit review
      </Button>
    </form>
  );
}
