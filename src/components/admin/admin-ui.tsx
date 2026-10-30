"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";

type AnyAction<I> = (input: I) => Promise<ActionResult<unknown>>;

function messageOf(data: unknown) {
  return (data as { message?: string } | undefined)?.message;
}

/** Runs a server action with optional confirmation, toast feedback and a data refresh. */
export function ActionButton<I>({
  action,
  input,
  confirm: confirmText,
  prompt,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & { action: AnyAction<I>; input: I; confirm?: string; prompt?: { label: string; key: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        let payload = input;
        if (prompt) {
          const value = window.prompt(prompt.label);
          if (!value) return;
          payload = { ...input, [prompt.key]: value } as I;
        }
        start(async () => {
          const res = await action(payload);
          if (res.ok) {
            toast.success(messageOf(res.data) ?? "Done");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      {children}
    </Button>
  );
}

export interface FieldConfig {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "checkbox" | "select" | "date" | "email";
  options?: { value: string; label: string }[];
  hint?: string;
  span?: 1 | 2;
  multiple?: boolean;
}

/**
 * Config-driven create/edit dialog. Inputs are validated by the action's Zod schema on the
 * server; field-level errors come back and are shown inline.
 */
export function FormDialog<I extends Record<string, unknown>>({
  title,
  trigger,
  fields,
  defaults,
  action,
  extra,
  submitLabel = "Save",
}: {
  title: string;
  trigger: React.ReactNode;
  fields: FieldConfig[];
  defaults: Partial<I>;
  action: AnyAction<I>;
  extra?: Partial<I>;
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const form = useForm<Record<string, unknown>>({ defaultValues: defaults as Record<string, unknown> });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const coerced = Object.fromEntries(
      Object.entries(values).map(([k, v]) => {
        const f = fields.find((x) => x.name === k);
        if (f?.type === "number" && v !== "" && v != null) return [k, Number(v)];
        return [k, v];
      }),
    );
    const res = await action({ ...coerced, ...extra } as I);
    if (res.ok) {
      toast.success(messageOf(res.data) ?? "Saved");
      setOpen(false);
      form.reset(values);
      router.refresh();
    } else {
      setError(res.error);
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) form.setError(k, { message: msgs[0] });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} className="max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {fields.map((f) => {
            const err = form.formState.errors[f.name]?.message as string | undefined;
            const span = f.span === 2 || f.type === "textarea" ? "sm:col-span-2" : undefined;
            if (f.type === "checkbox") return <Checkbox key={f.name} label={f.label} className={span} {...form.register(f.name)} />;
            return (
              <Field key={f.name} label={f.label} error={err} hint={f.hint} className={span}>
                {f.type === "textarea" ? (
                  <Textarea rows={4} {...form.register(f.name)} />
                ) : f.type === "select" ? (
                  <NativeSelect multiple={f.multiple} className={f.multiple ? "h-32 bg-none py-2" : undefined} {...form.register(f.name)}>
                    {!f.multiple && <option value="">—</option>}
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} {...form.register(f.name)} />
                )}
              </Field>
            );
          })}
          <div className="sm:col-span-2">
            <FormError message={error} />
          </div>
          <Button type="submit" className="sm:col-span-2" loading={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
