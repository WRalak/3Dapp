"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Lock, Smartphone, Wallet } from "lucide-react";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { checkoutAction } from "@/features/orders/actions";
import { api } from "@/lib/fetcher";
import { SHIPPING_METHODS } from "@/config/site";
import { cn, formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form-controls";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { CouponForm, OrderSummary } from "../cart/cart-client";
import type { CartView } from "@/types/cart";

interface Props {
  user: { email: string; name: string; phone: string } | null;
  addresses: { id: string; label: string | null; fullName: string; line1: string; city: string; country: string; phone: string; isDefault: boolean }[];
  paymentMethods: { id: "MPESA" | "CARD" | "PAYPAL" | "SANDBOX"; label: string }[];
  currency: string;
}

const PAYMENT_ICON = { MPESA: Smartphone, CARD: CreditCard, PAYPAL: Wallet, SANDBOX: Lock } as const;
const PAYMENT_HINT = {
  MPESA: "You'll get a prompt on your phone to enter your M-Pesa PIN.",
  CARD: "You'll be redirected to our secure card payment partner.",
  PAYPAL: "You'll be redirected to PayPal to approve the payment.",
  SANDBOX: "Development mode: approve or decline on a simulated gateway page.",
} as const;

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm({ user, addresses, paymentMethods, currency }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  // One idempotency key per checkout attempt: double submits create exactly one order.
  const idempotencyKey = useMemo(newKey, []);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  const form = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      email: user?.email ?? "",
      customerName: user?.name ?? "",
      phone: user?.phone ?? "",
      savedAddressId: defaultAddress?.id,
      address: defaultAddress ? undefined : { fullName: user?.name ?? "", phone: user?.phone ?? "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "KE" },
      saveAddress: !!user,
      shippingMethod: "standard",
      paymentMethod: paymentMethods[0]?.id ?? "CARD",
      mpesaPhone: "",
      notes: "",
      idempotencyKey,
    },
  });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;
  const shipping = watch("shippingMethod");
  const payment = watch("paymentMethod");
  const savedAddressId = watch("savedAddressId");

  const { data: cart, isLoading } = useQuery({
    queryKey: ["cart", shipping],
    queryFn: () => api<CartView>(`/api/cart?shipping=${shipping}`),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!cart || cart.lines.length === 0) {
    return (
      <EmptyState
        title="Your bag is empty"
        action={
          <Button asChild>
            <Link href="/shop">Continue shopping</Link>
          </Button>
        }
      />
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const payload = { ...values, savedAddressId: values.shippingMethod === "pickup" ? undefined : values.savedAddressId, address: values.savedAddressId ? undefined : values.address };
    const res = await checkoutAction(payload);
    if (!res.ok) {
      setServerError(res.error);
      for (const [path, messages] of Object.entries(res.fieldErrors ?? {})) form.setError(path as keyof CheckoutInput, { message: messages[0] });
      return;
    }
    await qc.invalidateQueries({ queryKey: ["cart"] });
    const target = res.data.redirectTo;
    if (/^https?:\/\//.test(target)) window.location.assign(target);
    else router.push(target);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-12 lg:grid-cols-12">
      <div className="space-y-12 lg:col-span-7">
        <section aria-labelledby="contact-h">
          <h2 id="contact-h" className="eyebrow mb-6 text-ink">
            1 · Contact
          </h2>
          {!user && (
            <p className="mb-4 text-sm text-taupe">
              Have an account?{" "}
              <Link href="/login?next=/checkout" className="underline underline-offset-4">
                Sign in
              </Link>{" "}
              for faster checkout.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={errors.email?.message} className="sm:col-span-2">
              <Input type="email" autoComplete="email" {...register("email")} />
            </Field>
            <Field label="Full name" error={errors.customerName?.message}>
              <Input autoComplete="name" {...register("customerName")} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input type="tel" autoComplete="tel" {...register("phone")} />
            </Field>
          </div>
        </section>

        <section aria-labelledby="ship-h">
          <h2 id="ship-h" className="eyebrow mb-6 text-ink">
            2 · Delivery
          </h2>
          <div className="grid gap-2" role="radiogroup" aria-label="Shipping method">
            {SHIPPING_METHODS.map((m) => (
              <label key={m.id} className={cn("flex cursor-pointer items-center justify-between border p-4 text-sm", shipping === m.id && "border-ink")}>
                <span className="flex items-center gap-3">
                  <input type="radio" value={m.id} {...register("shippingMethod")} className="accent-ink" />
                  <span>
                    {m.label} <span className="text-taupe">— {m.description}</span>
                  </span>
                </span>
                <span className="tabular-nums">{shipping === m.id ? (cart.shippingCents ? formatMoney(cart.shippingCents, currency) : "Free") : m.priceCents ? formatMoney(m.priceCents, currency) : "Free"}</span>
              </label>
            ))}
          </div>

          {shipping !== "pickup" && (
            <div className="mt-8 space-y-4">
              {addresses.length > 0 && (
                <div className="grid gap-2">
                  {addresses.map((a) => (
                    <label key={a.id} className={cn("flex cursor-pointer gap-3 border p-4 text-sm", savedAddressId === a.id && "border-ink")}>
                      <input type="radio" checked={savedAddressId === a.id} onChange={() => (setValue("savedAddressId", a.id), setValue("address", undefined))} className="mt-1 accent-ink" />
                      <span>
                        <strong className="font-medium">{a.label ?? a.fullName}</strong>
                        <span className="block text-taupe">
                          {a.line1}, {a.city}, {a.country} · {a.phone}
                        </span>
                      </span>
                    </label>
                  ))}
                  <label className={cn("flex cursor-pointer gap-3 border p-4 text-sm", !savedAddressId && "border-ink")}>
                    <input
                      type="radio"
                      checked={!savedAddressId}
                      onChange={() => {
                        setValue("savedAddressId", undefined);
                        setValue("address", { fullName: watch("customerName"), phone: watch("phone"), line1: "", line2: "", city: "", region: "", postalCode: "", country: "KE" });
                      }}
                      className="mt-1 accent-ink"
                    />
                    Use a new address
                  </label>
                </div>
              )}
              {!savedAddressId && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Recipient" error={errors.address?.fullName?.message}>
                    <Input autoComplete="shipping name" {...register("address.fullName")} />
                  </Field>
                  <Field label="Recipient phone" error={errors.address?.phone?.message}>
                    <Input type="tel" {...register("address.phone")} />
                  </Field>
                  <Field label="Street address" error={errors.address?.line1?.message} className="sm:col-span-2">
                    <Input autoComplete="shipping address-line1" {...register("address.line1")} />
                  </Field>
                  <Field label="Apartment, suite (optional)" error={errors.address?.line2?.message} className="sm:col-span-2">
                    <Input autoComplete="shipping address-line2" {...register("address.line2")} />
                  </Field>
                  <Field label="City" error={errors.address?.city?.message}>
                    <Input autoComplete="shipping address-level2" {...register("address.city")} />
                  </Field>
                  <Field label="Region / county" error={errors.address?.region?.message}>
                    <Input autoComplete="shipping address-level1" {...register("address.region")} />
                  </Field>
                  <Field label="Postal code" error={errors.address?.postalCode?.message}>
                    <Input autoComplete="shipping postal-code" {...register("address.postalCode")} />
                  </Field>
                  <Field label="Country code" error={errors.address?.country?.message} hint="e.g. KE, US, GB">
                    <Input autoComplete="shipping country" maxLength={2} {...register("address.country")} />
                  </Field>
                  {user && <Checkbox label="Save this address to my account" className="sm:col-span-2" {...register("saveAddress")} />}
                </div>
              )}
              {errors.address?.message && <p className="text-xs text-danger">{errors.address.message}</p>}
            </div>
          )}
        </section>

        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="eyebrow mb-6 text-ink">
            3 · Payment
          </h2>
          {paymentMethods.length === 0 ? (
            <p className="border border-warning/40 bg-warning/5 p-4 text-sm text-warning">Payments are not configured yet. Please contact support to complete your order.</p>
          ) : (
            <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
              {paymentMethods.map((m) => {
                const Icon = PAYMENT_ICON[m.id];
                return (
                  <label key={m.id} className={cn("flex cursor-pointer gap-3 border p-4 text-sm", payment === m.id && "border-ink")}>
                    <input type="radio" value={m.id} {...register("paymentMethod")} className="mt-1 accent-ink" />
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-4" /> {m.label}
                      </span>
                      <span className="mt-1 block text-taupe">{PAYMENT_HINT[m.id]}</span>
                      {payment === "MPESA" && m.id === "MPESA" && (
                        <span className="mt-3 block">
                          <Field label="M-Pesa number" error={errors.mpesaPhone?.message}>
                            <Input type="tel" placeholder="07XX XXX XXX" {...register("mpesaPhone")} />
                          </Field>
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <Field label="Order notes (optional)" className="mt-6" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </section>
      </div>

      <aside className="h-fit space-y-6 bg-surface p-6 lg:sticky lg:top-28 lg:col-span-5">
        <h2 className="eyebrow">Order summary</h2>
        <ul className="divide-y">
          {cart.lines.map((l) => (
            <li key={l.id} className="flex gap-3 py-3 text-sm">
              <div className="relative aspect-[3/4] w-14 shrink-0 bg-bone">{l.image && <Image src={l.image} alt="" fill sizes="56px" unoptimized={isSvgSource(l.image)} className="object-cover" />}</div>
              <div className="flex-1">
                <p>{l.name}</p>
                <p className="text-xs text-taupe">
                  {l.color} · {l.size} · ×{l.quantity}
                </p>
              </div>
              <span className="tabular-nums">{formatMoney(l.lineTotalCents, currency)}</span>
            </li>
          ))}
        </ul>
        <CouponForm cart={cart} />
        <OrderSummary cart={cart} />
        {cart.issues.length > 0 && <FormError message={cart.issues.join(". ")} />}
        <FormError message={serverError} />
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} disabled={paymentMethods.length === 0 || cart.issues.length > 0}>
          <Lock /> Place order · {formatMoney(cart.totalCents, currency)}
        </Button>
        <p className="text-center text-xs text-taupe">Your stock is held for 30 minutes while you complete payment.</p>
      </aside>
    </form>
  );
}
