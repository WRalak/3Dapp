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
import { etaLabel } from "@/features/delivery/availability";
import { cn, formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { CouponForm, OrderSummary } from "../cart/cart-client";
import type { CartView } from "@/types/cart";

interface Props {
  user: { email: string; name: string; phone: string } | null;
  addresses: { id: string; label: string | null; fullName: string; summary: string; countyId: string | null; town: string | null; phone: string; isDefault: boolean }[];
  counties: { id: string; name: string }[];
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

const DELIVERY_ICON: Record<string, string> = { SAME_DAY: "Same day", NEXT_DAY: "Next day", STANDARD: "Standard", COURIER: "Courier", PICKUP: "Pickup", SELLER_ARRANGED: "Seller arranged" };

function blankAddress(name: string, phone: string) {
  return { fullName: name, phone, countyId: "", town: "", estate: "", building: "", line1: "", directions: "" };
}

export function CheckoutForm({ user, addresses, counties, paymentMethods, currency }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  // One idempotency key per checkout attempt: double submits create exactly one order.
  const idempotencyKey = useMemo(newKey, []);
  const defaultAddress = addresses.find((a) => a.isDefault && a.countyId) ?? addresses.find((a) => a.countyId);

  const form = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      email: user?.email ?? "",
      customerName: user?.name ?? "",
      phone: user?.phone ?? "",
      savedAddressId: defaultAddress?.id,
      address: defaultAddress ? undefined : blankAddress(user?.name ?? "", user?.phone ?? ""),
      saveAddress: !!user,
      delivery: {},
      paymentMethod: paymentMethods[0]?.id ?? "CARD",
      mpesaPhone: "",
      notes: "",
      idempotencyKey,
    },
  });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;
  const payment = watch("paymentMethod");
  const savedAddressId = watch("savedAddressId");
  const delivery = watch("delivery") ?? {};
  const saved = addresses.find((a) => a.id === savedAddressId);
  const countyId = saved ? saved.countyId : watch("address.countyId");
  const town = saved ? saved.town : watch("address.town");

  // Delivery quotes are recomputed by the server for the destination and choices.
  const sel = Object.entries(delivery).map(([k, v]) => `${k}:${v}`).join(",");
  const { data: cart, isLoading } = useQuery({
    queryKey: ["cart", "checkout", countyId ?? "", town ?? "", sel],
    queryFn: () => api<CartView>(`/api/cart?${new URLSearchParams({ county: countyId ?? "", town: town ?? "", sel })}`),
    placeholderData: (prev) => prev,
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
    const payload = { ...values, address: values.savedAddressId ? undefined : values.address };
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

        <section aria-labelledby="addr-h">
          <h2 id="addr-h" className="eyebrow mb-6 text-ink">
            2 · Where should we deliver?
          </h2>
          <div className="space-y-4">
            {addresses.length > 0 && (
              <div className="grid gap-2">
                {addresses.map((a) => (
                  <label key={a.id} className={cn("flex cursor-pointer gap-3 border p-4 text-sm", savedAddressId === a.id && "border-ink", !a.countyId && "opacity-60")}>
                    <input type="radio" disabled={!a.countyId} checked={savedAddressId === a.id} onChange={() => (setValue("savedAddressId", a.id), setValue("address", undefined))} className="mt-1 accent-ink" />
                    <span>
                      <strong className="font-medium">{a.label ?? a.fullName}</strong>
                      <span className="block text-taupe">
                        {a.summary} · {a.phone}
                      </span>
                      {!a.countyId && <span className="block text-xs text-warning">Add the county to this address in your account to use it.</span>}
                    </span>
                  </label>
                ))}
                <label className={cn("flex cursor-pointer gap-3 border p-4 text-sm", !savedAddressId && "border-ink")}>
                  <input
                    type="radio"
                    checked={!savedAddressId}
                    onChange={() => {
                      setValue("savedAddressId", undefined);
                      setValue("address", blankAddress(watch("customerName"), watch("phone")));
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
                <Field label="Recipient phone" error={errors.address?.phone?.message} hint="The rider will call this number">
                  <Input type="tel" inputMode="tel" placeholder="07XX XXX XXX" autoComplete="shipping tel" {...register("address.phone")} />
                </Field>
                <Field label="County" error={errors.address?.countyId?.message}>
                  <NativeSelect {...register("address.countyId")}>
                    <option value="">Choose county</option>
                    {counties.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Town / area" error={errors.address?.town?.message} hint="e.g. Westlands, Nyali, Milimani">
                  <Input autoComplete="shipping address-level2" {...register("address.town")} />
                </Field>
                <Field label="Estate / neighbourhood" error={errors.address?.estate?.message}>
                  <Input {...register("address.estate")} />
                </Field>
                <Field label="Building, floor, house no. (optional)" error={errors.address?.building?.message}>
                  <Input autoComplete="shipping address-line2" {...register("address.building")} />
                </Field>
                <Field label="Street / road (optional)" error={errors.address?.line1?.message} className="sm:col-span-2">
                  <Input autoComplete="shipping address-line1" {...register("address.line1")} />
                </Field>
                <Field label="Directions for the rider (optional)" error={errors.address?.directions?.message} className="sm:col-span-2" hint="Landmarks help — e.g. “opposite the Total petrol station, blue gate”">
                  <Textarea rows={2} {...register("address.directions")} />
                </Field>
                {user && <Checkbox label="Save this address to my account" className="sm:col-span-2" {...register("saveAddress")} />}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="ship-h">
          <h2 id="ship-h" className="eyebrow mb-2 text-ink">
            3 · Delivery
          </h2>
          <p className="mb-6 text-sm text-taupe">Each designer delivers their pieces separately. Choose an option for each.</p>
          {!countyId ? (
            <p className="border p-4 text-sm text-taupe">Choose your county above to see delivery options.</p>
          ) : (
            <div className="space-y-6">
              {cart.groups.map((g) => (
                <fieldset key={g.sellerId} className="space-y-2">
                  <legend className="mb-2 text-sm">
                    <span className="font-medium">{g.sellerName}</span>
                    <span className="text-taupe">
                      {" "}
                      · {g.lines.reduce((n, l) => n + l.quantity, 0)} item(s) · from {[g.sellerTown, g.sellerCounty].filter(Boolean).join(", ")}
                    </span>
                  </legend>
                  {g.deliveryOptions.length === 0 && <p className="border border-warning/40 bg-warning/5 p-3 text-sm text-warning">{g.sellerName} doesn&apos;t deliver to this area yet. Remove their items or choose another address.</p>}
                  {g.deliveryOptions.map((o) => (
                    <label key={o.methodId} className={cn("flex cursor-pointer items-center justify-between gap-3 border p-4 text-sm", delivery[g.sellerId] === o.methodId && "border-ink")}>
                      <span className="flex items-center gap-3">
                        <input type="radio" name={`delivery-${g.sellerId}`} checked={delivery[g.sellerId] === o.methodId} onChange={() => setValue("delivery", { ...delivery, [g.sellerId]: o.methodId })} className="accent-ink" />
                        <span>
                          {o.name} <span className="text-taupe">— {DELIVERY_ICON[o.type]}, {etaLabel(o.etaMinDays, o.etaMaxDays).toLowerCase()}</span>
                          {o.pickupAddress && <span className="block text-xs text-taupe">Collect from: {o.pickupAddress}</span>}
                        </span>
                      </span>
                      <span className="tabular-nums">{o.priceCents ? formatMoney(o.priceCents, currency) : "Free"}</span>
                    </label>
                  ))}
                  {errors.delivery && (errors.delivery as Record<string, { message?: string }>)[g.sellerId]?.message && <p className="text-xs text-danger">Choose a delivery option</p>}
                </fieldset>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="eyebrow mb-6 text-ink">
            4 · Payment
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
        <OrderSummary cart={cart} deliveryPending={!cart.deliveryComplete} />
        {cart.issues.length > 0 && <FormError message={cart.issues.join(". ")} />}
        <FormError message={serverError} />
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} disabled={paymentMethods.length === 0 || cart.issues.length > 0 || !cart.deliveryComplete}>
          <Lock /> Place order · {formatMoney(cart.totalCents, currency)}
        </Button>
        {!cart.deliveryComplete && <p className="text-center text-xs text-taupe">Choose a delivery option for each designer to continue.</p>}
        <p className="text-center text-xs text-taupe">Your items are held for 30 minutes while you complete payment. You only pay once — we pay each designer.</p>
      </aside>
    </form>
  );
}
