"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GARMENT_KINDS, productInputSchema, type ProductInput } from "@/lib/validation/admin";
import { createProductAction, updateProductAction } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";

interface Option {
  id: string;
  name: string;
}

export function ProductForm({
  productId,
  defaults,
  brands,
  categories,
  collections,
  canPublish,
}: {
  productId?: string;
  defaults: ProductInput;
  brands: Option[];
  categories: Option[];
  collections: Option[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ProductInput>({ resolver: zodResolver(productInputSchema), defaultValues: defaults });
  const variants = useFieldArray({ control: form.control, name: "variants" });
  const { register, formState } = form;
  const e = formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = productId ? await updateProductAction({ ...values, id: productId }) : await createProductAction(values);
    if (!res.ok) {
      setError(res.error);
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof ProductInput, { message: msgs[0] });
      return;
    }
    toast.success(productId ? "Product saved" : "Product created");
    if (!productId && "id" in res.data) router.push(`/admin/products/${(res.data as { id: string }).id}`);
    else router.refresh();
  });

  const addVariant = () => {
    const last = form.getValues("variants").at(-1);
    variants.append({
      sku: "",
      size: "",
      color: last?.color ?? "",
      colorHex: last?.colorHex ?? "#1c1b19",
      price: "" as unknown as number,
      salePrice: "" as unknown as number,
      stock: 0,
      lowStockThreshold: 5,
      isActive: true,
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-10" noValidate>
      <section className="grid gap-4 border bg-surface p-6 md:grid-cols-2">
        <h2 className="eyebrow md:col-span-2">Details</h2>
        <Field label="Name" error={e.name?.message}>
          <Input {...register("name")} />
        </Field>
        <Field label="URL slug" error={e.slug?.message} hint="Leave blank to generate from the name">
          <Input {...register("slug")} />
        </Field>
        <Field label="Description" error={e.description?.message} className="md:col-span-2">
          <Textarea rows={5} {...register("description")} />
        </Field>
        <Field label="Brand" error={e.brandId?.message}>
          <NativeSelect {...register("brandId")}>
            <option value="">Choose…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Category" error={e.categoryId?.message}>
          <NativeSelect {...register("categoryId")}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Garment type" error={e.garmentKind?.message} hint="Controls the 3D silhouette when no model is uploaded">
          <NativeSelect {...register("garmentKind")}>
            {GARMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status" error={e.status?.message} hint={canPublish ? undefined : "You need publish permission to change this"}>
          <NativeSelect disabled={!canPublish} {...register("status")}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </NativeSelect>
        </Field>
        <Field label="Collections" hint="Hold Ctrl/⌘ to select several" className="md:col-span-2">
          <NativeSelect multiple className="h-28 bg-none py-2" {...register("collectionIds")}>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tags" error={e.tags?.message} hint="Comma separated" className="md:col-span-2">
          <Input {...register("tags")} />
        </Field>
        <Checkbox label="Feature on the homepage" {...register("isFeatured")} />
      </section>

      <section className="grid gap-4 border bg-surface p-6 md:grid-cols-3">
        <h2 className="eyebrow md:col-span-3">Pricing</h2>
        <Field label="Price" error={e.price?.message}>
          <Input type="number" step="0.01" min="0" {...register("price")} />
        </Field>
        <Field label="Sale price" error={e.salePrice?.message} hint="Optional">
          <Input type="number" step="0.01" min="0" {...register("salePrice")} />
        </Field>
        <Field label="Sale ends" error={e.saleEndsAt?.message} hint="Optional">
          <Input type="datetime-local" {...register("saleEndsAt")} />
        </Field>
      </section>

      <section className="grid gap-4 border bg-surface p-6 md:grid-cols-2">
        <h2 className="eyebrow md:col-span-2">Fabric & specifications</h2>
        <Field label="Material" error={e.material?.message}>
          <Input {...register("material")} />
        </Field>
        <Field label="Fabric composition" error={e.fabricComposition?.message}>
          <Input {...register("fabricComposition")} />
        </Field>
        <Field label="Care instructions" error={e.careInstructions?.message} className="md:col-span-2">
          <Textarea rows={2} {...register("careInstructions")} />
        </Field>
        <Field label="Measurements (JSON, cm)" error={e.measurements?.message} hint='{"S": {"chest": 88, "length": 66}}'>
          <Textarea rows={5} className="font-mono text-xs" {...register("measurements")} />
        </Field>
        <Field label="Specifications (JSON)" error={e.specifications?.message} hint='[{"label": "Fit", "value": "Relaxed"}]'>
          <Textarea rows={5} className="font-mono text-xs" {...register("specifications")} />
        </Field>
      </section>

      <section className="border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="eyebrow">Variants & stock</h2>
          <Button type="button" size="sm" variant="outline" onClick={addVariant}>
            <Plus /> Add variant
          </Button>
        </div>
        {e.variants?.message && <p className="mb-3 text-xs text-danger">{e.variants.message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="eyebrow text-left text-taupe">
                <th className="py-2 pr-2 font-medium">SKU</th>
                <th className="py-2 pr-2 font-medium">Size</th>
                <th className="py-2 pr-2 font-medium">Colour</th>
                <th className="py-2 pr-2 font-medium">Hex</th>
                <th className="py-2 pr-2 font-medium">Price override</th>
                <th className="py-2 pr-2 font-medium">Sale override</th>
                <th className="py-2 pr-2 font-medium">{productId ? "Stock*" : "Initial stock"}</th>
                <th className="py-2 pr-2 font-medium">Low at</th>
                <th className="py-2 font-medium">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.fields.map((v, i) => {
                const ve = e.variants?.[i];
                return (
                  <tr key={v.id} className="border-t align-top">
                    <td className="py-2 pr-2">
                      <Input className="h-9" aria-label="SKU" aria-invalid={!!ve?.sku} {...register(`variants.${i}.sku`)} />
                      {ve?.sku && <p className="text-[11px] text-danger">{ve.sku.message}</p>}
                    </td>
                    <td className="py-2 pr-2">
                      <Input className="h-9 w-20" aria-label="Size" aria-invalid={!!ve?.size} {...register(`variants.${i}.size`)} />
                      {ve?.size && <p className="text-[11px] text-danger">{ve.size.message}</p>}
                    </td>
                    <td className="py-2 pr-2">
                      <Input className="h-9" aria-label="Colour" {...register(`variants.${i}.color`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="color" className="h-9 w-14 p-1" aria-label="Colour hex" {...register(`variants.${i}.colorHex`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="number" step="0.01" className="h-9 w-24" aria-label="Price override" {...register(`variants.${i}.price`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="number" step="0.01" className="h-9 w-24" aria-label="Sale override" {...register(`variants.${i}.salePrice`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="number" min="0" className="h-9 w-20" aria-label="Stock" disabled={!!v.id && !!productId && !!form.getValues(`variants.${i}.id`)} {...register(`variants.${i}.stock`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input type="number" min="0" className="h-9 w-16" aria-label="Low stock threshold" {...register(`variants.${i}.lowStockThreshold`)} />
                    </td>
                    <td className="py-2 pr-2 pt-4">
                      <input type="checkbox" className="size-4 accent-ink" aria-label="Active" {...register(`variants.${i}.isActive`)} />
                    </td>
                    <td className="py-2">
                      <button type="button" onClick={() => variants.remove(i)} className="p-2 text-taupe hover:text-danger" aria-label="Remove variant">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {productId && <p className="mt-3 text-xs text-taupe">* Existing variants&apos; stock is managed in Inventory so every change is recorded as a movement.</p>}
      </section>

      <section className="grid gap-4 border bg-surface p-6 md:grid-cols-2">
        <h2 className="eyebrow md:col-span-2">SEO</h2>
        <Field label="SEO title" error={e.seoTitle?.message} hint="Up to 70 characters">
          <Input {...register("seoTitle")} />
        </Field>
        <Field label="SEO description" error={e.seoDescription?.message} hint="Up to 160 characters">
          <Input {...register("seoDescription")} />
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-4 border-t bg-ivory/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <FormError message={error} />
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          {productId ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
