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

export function OrderSummary({ cart, children }: { cart: CartView; children?: React.ReactNode }) {
  const m = (c: number) => formatMoney(c, cart.currency);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{m(cart.subtotalCents)}</span>
      </div>
      {cart.discountCents > 0 && (
        <div className="flex justify-between text-clay">
          <span>Discount ({cart.couponCode})</span>
          <span className="tabular-nums">−{m(cart.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>Shipping</span>
        <span className="tabular-nums">{cart.shippingCents ? m(cart.shippingCents) : "Free"}</span>
      </div>
      <div className="flex justify-between">
        <span>{cart.taxInclusive ? "Tax (included)" : "Tax"}</span>
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
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) apply.mutate(code.trim());
      }}
    >
      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Discount code" aria-label="Discount code" className="h-10" maxLength={40} />
      <Button type="submit" variant="outline" size="sm" className="h-10" loading={apply.isPending}>
        Apply
      </Button>
    </form>
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
        <ul className="divide-y border-y">
          {cart.lines.map((l) => (
            <CartLineRow key={l.id} line={l} currency={cart.currency} />
          ))}
        </ul>
      </div>
      <aside className="h-fit space-y-6 bg-surface p-6 lg:sticky lg:top-28 lg:col-span-4">
        <h2 className="eyebrow">Summary</h2>
        <CouponForm cart={cart} />
        <OrderSummary cart={cart} />
        {cart.freeShippingRemainingCents ? <p className="text-xs text-taupe">Add {formatMoney(cart.freeShippingRemainingCents, cart.currency)} for free standard delivery.</p> : null}
        <Button asChild size="lg" className="w-full" aria-disabled={cart.issues.length > 0}>
          <Link href={cart.issues.length ? "#" : "/checkout"}>Checkout</Link>
        </Button>
        <p className="text-center text-xs text-taupe">M-Pesa · Card · PayPal</p>
      </aside>
    </div>
  );
}
