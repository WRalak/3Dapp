"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { BUSINESS_TYPES, sellerApplicationSchema } from "@/lib/validation/marketplace";
import { applyAsSellerAction } from "@/features/marketplace/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";

type Values = z.input<typeof sellerApplicationSchema>;

const TYPE_LABEL: Record<(typeof BUSINESS_TYPES)[number], string> = {
  DESIGNER: "Independent designer / tailor",
  BOUTIQUE: "Boutique",
  BRAND: "Fashion brand",
  MANUFACTURER: "Manufacturer / workshop",
  RETAILER: "Retailer",
};

export function SellerApplicationForm({ counties, categories, defaults }: { counties: { id: string; name: string }[]; categories: { slug: string; name: string }[]; defaults: Partial<Values> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(sellerApplicationSchema),
    defaultValues: { businessType: "DESIGNER", categories: [], website: "", instagram: "", registrationNumber: "", kraPin: "", logoUrl: "", coverUrl: "", ...defaults } as Values,
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const res = await applyAsSellerAction(v);
    if (!res.ok) {
      setError(res.error);
      for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m[0] });
      return;
    }
    router.push("/sell/status");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
      <Field label="Business or brand name" error={e.businessName?.message}>
        <Input {...form.register("businessName")} />
      </Field>
      <Field label="What best describes you?" error={e.businessType?.message}>
        <NativeSelect {...form.register("businessType")}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Contact person" error={e.contactName?.message}>
        <Input autoComplete="name" {...form.register("contactName")} />
      </Field>
      <Field label="Business email" error={e.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Phone (M-Pesa registered)" error={e.phone?.message} hint="Used for order alerts and payouts">
        <Input type="tel" inputMode="tel" placeholder="07XX XXX XXX" {...form.register("phone")} />
      </Field>
      <Field label="County" error={e.countyId?.message}>
        <NativeSelect {...form.register("countyId")}>
          <option value="">Choose county</option>
          {counties.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Town / area" error={e.town?.message}>
        <Input {...form.register("town")} />
      </Field>
      <Field label="Instagram handle (optional)" error={e.instagram?.message}>
        <Input placeholder="@yourbrand" {...form.register("instagram")} />
      </Field>
      <Field label="About your brand" error={e.description?.message} className="sm:col-span-2" hint="Your story, your craft, what makes your pieces special. Shown on your store page.">
        <Textarea rows={5} {...form.register("description")} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm">What do you sell?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={c.slug} {...form.register("categories")} className="accent-ink" />
              {c.name}
            </label>
          ))}
        </div>
        {e.categories?.message && <p className="mt-1 text-xs text-danger">{e.categories.message}</p>}
      </fieldset>
      <Field label="Website (optional)" error={e.website?.message}>
        <Input placeholder="https://" {...form.register("website")} />
      </Field>
      <Field label="Business registration no. (optional)" error={e.registrationNumber?.message} hint="BRS certificate number if registered">
        <Input {...form.register("registrationNumber")} />
      </Field>
      <Field label="KRA PIN (optional)" error={e.kraPin?.message}>
        <Input placeholder="A123456789B" {...form.register("kraPin")} />
      </Field>
      <div className="sm:col-span-2">
        <Checkbox label="I agree to the 3Dapp seller terms: honest listings, original designs, and shipping within my stated delivery times." {...form.register("acceptTerms")} />
        {e.acceptTerms?.message && <p className="mt-1 text-xs text-danger">{e.acceptTerms.message}</p>}
      </div>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <Button type="submit" size="lg" className="sm:col-span-2" loading={form.formState.isSubmitting}>
        Submit application
      </Button>
    </form>
  );
}
