"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "My orders" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/security", label: "Security" },
];

export function AccountNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {LINKS.map((l) => {
          const active = l.href === "/account" ? pathname === "/account" : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center justify-between gap-3 whitespace-nowrap px-3 py-2 text-sm", active ? "bg-ink text-ivory" : "text-graphite hover:bg-bone")}
              >
                {l.label}
                {l.href === "/account/notifications" && unread > 0 && <span className="rounded-full bg-clay px-1.5 text-[10px] text-ivory">{unread}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
