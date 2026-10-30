"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Price, Skeleton } from "@/components/ui/misc";
import { useCart, useUpdateCartItem } from "@/hooks/use-cart";
import { useUiStore } from "@/stores/ui-store";
import { formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";
import type { CartLine } from "@/types/cart";

export function CartLineRow({ line, currency, compact }: { line: CartLine; currency: string; compact?: boolean }) {
  const update = useUpdateCartItem();
  const busy = update.isPending;
  return (
    <li className="flex gap-4 py-5">
      <Link href={`/products/${line.slug}`} className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-bone sm:w-24">
        {line.image && <Image src={line.image} alt={line.name} fill sizes="96px" unoptimized={isSvgSource(line.image)} className="object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-taupe">{line.brand}</p>
            <Link href={`/products/${line.slug}`} className="mt-1 block truncate text-sm font-medium">
              {line.name}
            </Link>
            <p className="mt-1 text-xs text-taupe">
              {line.color} · {line.size}
            </p>
          </div>
          <Price cents={line.lineTotalCents} currency={currency} className="text-sm" />
        </div>
        {line.promotionDiscountCents > 0 && <p className="mt-1 text-xs text-clay">{line.promotionName}: −{formatMoney(line.promotionDiscountCents, currency)}</p>}
        {line.available < line.quantity && <p className="mt-2 text-xs text-danger">{line.available === 0 ? "Sold out" : `Only ${line.available} left`}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-center border" aria-label={`Quantity for ${line.name}`}>
            <button type="button" className="p-2 disabled:opacity-30" disabled={busy} onClick={() => update.mutate({ itemId: line.id, quantity: line.quantity - 1 })} aria-label="Decrease quantity">
              <Minus className="size-3" />
            </button>
            <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              className="p-2 disabled:opacity-30"
              disabled={busy || line.quantity >= line.available || line.quantity >= 20}
              onClick={() => update.mutate({ itemId: line.id, quantity: line.quantity + 1 })}
              aria-label="Increase quantity"
            >
              <Plus className="size-3" />
            </button>
          </div>
          {!compact && (
            <button type="button" disabled={busy} onClick={() => update.mutate({ itemId: line.id, quantity: 0 })} className="text-xs text-taupe underline-offset-4 hover:text-ink hover:underline">
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function CartDrawer() {
  const open = useUiStore((s) => s.cartOpen);
  const setOpen = useUiStore((s) => s.setCartOpen);
  const { data: cart, isLoading } = useCart();

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title={`Your bag${cart?.itemCount ? ` (${cart.itemCount})` : ""}`}
      footer={
        cart && cart.lines.length > 0 ? (
          <div className="space-y-4">
            {cart.groups.length > 1 && <p className="text-xs text-taupe">From {cart.groups.length} designers — each delivers separately.</p>}
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(cart.subtotalCents - cart.discountCents, cart.currency)}</span>
            </div>
            <p className="text-xs text-taupe">Delivery calculated at checkout. Prices include VAT.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" onClick={() => setOpen(false)}>
                <Link href="/cart">View bag</Link>
              </Button>
              <Button asChild onClick={() => setOpen(false)}>
                <Link href="/checkout">Checkout</Link>
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div className="px-6">
        {isLoading ? (
          <div className="space-y-4 py-6">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-28 w-20" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !cart || cart.lines.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icon={<ShoppingBag className="size-8" strokeWidth={1} />}
              title="Your bag is empty"
              description="Pieces you add will appear here."
              action={
                <Button asChild variant="outline" onClick={() => setOpen(false)}>
                  <Link href="/shop">Continue shopping</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y">
            {cart.lines.map((l) => (
              <CartLineRow key={l.id} line={l} currency={cart.currency} />
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
