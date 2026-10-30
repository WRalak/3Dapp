"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useApplyCoupon, useCart, useRemoveCoupon } from "@/hooks/use-cart";
import { CartLineRow } from "@/components/store/cart-drawer";
import { RecentlyViewed } from "@/components/products/product-tracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { formatMoney } from "@/lib/utils";
import type { CartView } from "@/types/cart";

export function OrderSummary({ cart, children, deliveryPending }: { cart: CartView; children?: React.ReactNode; deliveryPending?: boolean }) {
  const m = (c: number) => formatMoney(c, cart.currency);
  const pending = deliveryPending ?? !cart.deliveryComplete;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{m(cart.subtotalCents)}</span>
      </div>
      {cart.promotionDiscountCents > 0 && (
        <div className="flex justify-between text-clay">
          <span>Offers</span>
          <span className="tabular-nums">{m(-cart.promotionDiscountCents)}</span>
        </div>
      )}
      {cart.couponDiscountCents > 0 && (
        <div className="flex justify-between text-clay">
          <span>Code {cart.couponCode}</span>
          <span className="tabular-nums">{m(-cart.couponDiscountCents)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Delivery{cart.groups.length > 1 ? ` (${cart.groups.length} sellers)` : ""}</span>
        <span className="tabular-nums">{cart.freeShipping ? "Free" : pending ? "Calculated at checkout" : cart.shippingCents ? m(cart.shippingCents) : "Free"}</span>
      </div>
      <div className="flex justify-between">
        <span>{cart.taxInclusive ? "VAT (included)" : "VAT"}</span>
        <span className="tabular-nums">{m(cart.taxCents)}</span>
      </div>
      <div className="flex justify-between border-t pt-4 text-base font-medium">
        <span>Total</span>
        <span className="tabular-nums">{m(cart.totalCents)}</span>
      </div>
      {children}
    </div>
  );
}

export function CouponForm({ cart }: { cart: CartView }) {
  const [code, setCode] = useState("");
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();
  if (cart.couponCode) {
    return (
      <div className="flex items-center justify-between border border-dashed px-3 py-2 text-sm">
        <span>
          Code <strong>{cart.couponCode}</strong>
          {cart.couponError && <span className="block text-xs text-danger">{cart.couponError}</span>}
        </span>
        <button type="button" onClick={() => remove.mutate()} className="text-xs underline underline-offset-4">
          Remove
        </button>
      </div>
    );
  }
  // Not a <form>: this control is also rendered inside the checkout form, and forms can't nest.
  const submit = () => {
    if (code.trim()) apply.mutate(code.trim());
  };
  return (
    <div className="flex gap-2" role="group" aria-label="Discount code">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Discount code"
        aria-label="Discount code"
        className="h-10"
        maxLength={40}
      />
      <Button type="button" variant="outline" size="sm" className="h-10" loading={apply.isPending} onClick={submit}>
        Apply
      </Button>
    </div>
  );
}

export function CartPageClient() {
  const { data: cart, isLoading } = useCart();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!cart || cart.lines.length === 0) {
    return (
      <>
        <EmptyState
          icon={<ShoppingBag className="size-8" strokeWidth={1} />}
          title="Your bag is empty"
          description="Find something you love on the rail."
          action={
            <Button asChild>
              <Link href="/showroom">Visit the showroom</Link>
            </Button>
          }
        />
        <RecentlyViewed title="Pick up where you left off" />
      </>
    );
  }
  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-8">
        {cart.issues.length > 0 && (
          <div role="alert" className="mb-4 border border-warning/40 bg-warning/5 p-4 text-sm text-warning">
            {cart.issues.join(". ")}. Please adjust quantities before checkout.
          </div>
        )}
        <div className="space-y-8">
          {cart.groups.map((g) => (
            <section key={g.sellerId} aria-label={`Items from ${g.sellerName}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium">
                  <Link href={`/designers/${g.sellerSlug}`} className="link-underline">
                    {g.sellerName}
                  </Link>
                </h2>
                <span className="text-xs text-taupe">{[g.sellerTown, g.sellerCounty].filter(Boolean).join(", ")} · ships separately</span>
              </div>
              <ul className="divide-y border-y">
                {g.lines.map((l) => (
                  <CartLineRow key={l.id} line={l} currency={cart.currency} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <aside className="h-fit space-y-6 bg-surface p-6 lg:sticky lg:top-28 lg:col-span-4">
        <h2 className="eyebrow">Summary</h2>
        <CouponForm cart={cart} />
        <OrderSummary cart={cart} />
        <p className="text-xs text-taupe">Each designer delivers separately — choose your county at checkout to see delivery options and times.</p>
        <Button asChild size="lg" className="w-full" aria-disabled={cart.issues.length > 0}>
          <Link href={cart.issues.length ? "#" : "/checkout"}>Checkout</Link>
        </Button>
        <p className="text-center text-xs text-taupe">M-Pesa · Card · PayPal</p>
      </aside>
    </div>
  );
}
