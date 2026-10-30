"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Drawer } from "@/components/ui/dialog";
import { mainNav } from "@/config/site";
import { useUiStore } from "@/stores/ui-store";
import { useT } from "@/i18n/client";

const categories = [
  { label: "Women", href: "/shop?category=women" },
  { label: "Men", href: "/shop?category=men" },
  { label: "Children", href: "/shop?category=children" },
  { label: "Shoes", href: "/shop?category=shoes" },
  { label: "Bags", href: "/shop?category=bags" },
  { label: "Accessories", href: "/shop?category=accessories" },
  { label: "Sportswear", href: "/shop?category=sportswear" },
  { label: "Luxury", href: "/shop?category=luxury" },
];

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const pathname = usePathname();
  const t = useT();
  useEffect(() => setOpen(false), [pathname, setOpen]);

  return (
    <Drawer open={open} onOpenChange={setOpen} side="left" title="Menu">
      <nav aria-label="Mobile" className="px-6 py-8">
        <ul className="space-y-5">
          {[{ key: "nav.home", href: "/" } as const, ...mainNav].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-3xl font-medium tracking-tight">
                {t(item.key)}
              </Link>
            </li>
          ))}
        </ul>
        <p className="eyebrow mb-4 mt-12 text-taupe">Shop by category</p>
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {categories.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="text-graphite hover:text-ink">
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-col gap-3 border-t pt-8 text-sm">
          <Link href="/wishlist">Wishlist</Link>
          <Link href={signedIn ? "/account" : "/login"}>{signedIn ? "My account" : "Sign in / Register"}</Link>
        </div>
      </nav>
    </Drawer>
  );
}
