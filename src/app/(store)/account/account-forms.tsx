"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { addressSchema, notificationPrefsSchema, profileSchema } from "@/lib/validation/account";
import { changePasswordSchema } from "@/lib/validation/auth";
import {
  cancelMyOrderAction,
  changePasswordAction,
  deleteAddressAction,
  markNotificationsReadAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  saveAddressAction,
  setDefaultAddressAction,
  updateNotificationPrefsAction,
  updateProfileAction,
} from "@/features/users/actions";
import { resendVerificationAction } from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        const msg = (res.data as { message?: string } | undefined)?.message;
        if (msg) toast.success(msg);
        onOk?.(res.data);
        router.refresh();
      } else toast.error(res.error);
    });
  return { pending, run };
}

export function ResendVerification() {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => resendVerificationAction({}))}>
      Resend email
    </Button>
  );
}

export function CancelMyOrder({ orderId }: { orderId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => confirm("Cancel this order? Reserved items will be released.") && run(() => cancelMyOrderAction({ orderId }))}>
      Cancel order
    </Button>
  );
}

export function ProfileForm({ defaults }: { defaults: z.input<typeof profileSchema> }) {
  const form = useForm<z.input<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await updateProfileAction(v);
    if (res.ok) {
      toast.success(res.data.message);
      setError(null);
      router.refresh();
    } else setError(res.error);
  });
  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-5" noValidate>
      <Field label="Full name" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </Field>
      <Field label="Phone" error={form.formState.errors.phone?.message}>
        <Input type="tel" {...form.register("phone")} />
      </Field>
      <Field label="Profile photo URL" error={form.formState.errors.image?.message} hint="https:// link to an image">
        <Input type="url" {...form.register("image")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" loading={form.formState.isSubmitting}>
        Save profile
      </Button>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const form = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: hasPassword ? "" : "-", password: "", confirmPassword: "" } });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await changePasswordAction(v);
    if (res.ok) {
      toast.success(res.data.message);
      form.reset();
      setError(null);
    } else {
      setError(res.error);
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) form.setError(k as "password", { message: msgs[0] });
    }
  });
  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-5" noValidate>
      {hasPassword && (
        <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
          <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
        </Field>
      )}
      <Field label="New password" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirm new password" error={form.formState.errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" loading={form.formState.isSubmitting}>
        {hasPassword ? "Change password" : "Set password"}
      </Button>
    </form>
  );
}

type AddressValues = z.input<typeof addressSchema> & { id?: string };

export function AddressDialog({ address, trigger, counties }: { address?: AddressValues; trigger: React.ReactNode; counties: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address ?? { label: "", fullName: "", phone: "", countyId: "", town: "", estate: "", building: "", line1: "", directions: "", isDefault: false },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await saveAddressAction({ ...v, id: address?.id });
    if (res.ok) {
      toast.success(res.data.message);
      setOpen(false);
      router.refresh();
    } else setError(res.error);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={address ? "Edit address" : "Add address"}>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Label (optional)" error={e.label?.message} className="sm:col-span-2">
            <Input placeholder="Home, Office…" {...form.register("label")} />
          </Field>
          <Field label="Full name" error={e.fullName?.message}>
            <Input {...form.register("fullName")} />
          </Field>
          <Field label="Phone" error={e.phone?.message}>
            <Input type="tel" {...form.register("phone")} />
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
          <Field label="Estate / neighbourhood" error={e.estate?.message}>
            <Input {...form.register("estate")} />
          </Field>
          <Field label="Building, floor, house no." error={e.building?.message}>
            <Input {...form.register("building")} />
          </Field>
          <Field label="Street / road (optional)" error={e.line1?.message} className="sm:col-span-2">
            <Input {...form.register("line1")} />
          </Field>
          <Field label="Directions for the rider (optional)" error={e.directions?.message} className="sm:col-span-2">
            <Textarea rows={2} {...form.register("directions")} />
          </Field>
          <Checkbox label="Set as default delivery address" className="sm:col-span-2" {...form.register("isDefault")} />
          <div className="sm:col-span-2">
            <FormError message={error} />
          </div>
          <Button type="submit" className="sm:col-span-2" loading={form.formState.isSubmitting}>
            Save address
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddressActions({ id, isDefault }: { id: string; isDefault: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-3 text-xs">
      {!isDefault && (
        <button type="button" disabled={pending} onClick={() => run(() => setDefaultAddressAction({ id }))} className="underline underline-offset-4">
          Set as default
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => confirm("Delete this address?") && run(() => deleteAddressAction({ id }))} className="text-danger underline underline-offset-4">
        Delete
      </button>
    </div>
  );
}

export function NotificationPrefsForm({ defaults }: { defaults: z.input<typeof notificationPrefsSchema> }) {
  const form = useForm<z.input<typeof notificationPrefsSchema>>({ resolver: zodResolver(notificationPrefsSchema), defaultValues: defaults });
  const onSubmit = form.handleSubmit(async (v) => {
    const res = await updateNotificationPrefsAction(v);
    if (res.ok) toast.success(res.data.message);
    else toast.error(res.error);
  });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Checkbox label="Order updates" {...form.register("notifyOrderUpdates")} />
      <Checkbox label="Delivery notifications" {...form.register("notifyDelivery")} />
      <Checkbox label="Restock alerts" {...form.register("notifyRestock")} />
      <Checkbox label="Promotions & early access" {...form.register("notifyPromotions")} />
      <Button type="submit" size="sm" variant="outline" loading={form.formState.isSubmitting}>
        Save preferences
      </Button>
    </form>
  );
}

export function MarkAllRead() {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => markNotificationsReadAction({}))}>
      Mark all as read
    </Button>
  );
}

export function SessionActions({ sessionId, current }: { sessionId?: string; current?: boolean }) {
  const { pending, run } = useAction();
  if (!sessionId)
    return (
      <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => revokeOtherSessionsAction({}))}>
        Sign out all other sessions
      </Button>
    );
  if (current) return <span className="text-xs text-success">This device</span>;
  return (
    <button type="button" disabled={pending} onClick={() => run(() => revokeSessionAction({ sessionId }))} className="text-xs underline underline-offset-4">
      Sign out
    </button>
  );
}
