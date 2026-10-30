"use client";

import { Menu, Search, ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/stores/ui-store";

export function CartButton() {
  const { data } = useCart();
  const setCartOpen = useUiStore((s) => s.setCartOpen);
  const count = data?.itemCount ?? 0;
  return (
    <button type="button" onClick={() => setCartOpen(true)} className="relative p-2.5 text-graphite hover:text-ink" aria-label={`Shopping bag, ${count} item${count === 1 ? "" : "s"}`}>
      <ShoppingBag className="size-[18px]" strokeWidth={1.5} />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-ink text-[9px] font-medium text-ivory tabular-nums" aria-hidden>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

export function SearchButton() {
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  return (
    <button type="button" onClick={() => setSearchOpen(true)} className="p-2.5 text-graphite hover:text-ink" aria-label="Search">
      <Search className="size-[18px]" strokeWidth={1.5} />
    </button>
  );
}

export function MobileNavButton() {
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <button type="button" onClick={() => setOpen(true)} className="-ml-2 p-2.5 text-graphite hover:text-ink lg:hidden" aria-label="Open menu">
      <Menu className="size-5" strokeWidth={1.5} />
    </button>
  );
}
