"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Box,
  FolderTree,
  LayoutDashboard,
  Layers,
  Menu,
  Package,
  ScrollText,
  Shield,
  ShoppingCart,
  Users,
  UserCog,
  Warehouse,
  Newspaper,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/auth/permissions";

const NAV: { href: string; label: string; icon: typeof Box; perm?: Permission }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package, perm: "products.view" },
  { href: "/admin/3d-assets", label: "3D assets", icon: Box, perm: "assets.manage" },
  { href: "/admin/categories", label: "Categories & brands", icon: FolderTree, perm: "categories.manage" },
  { href: "/admin/collections", label: "Collections", icon: Layers, perm: "collections.manage" },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, perm: "orders.view" },
  { href: "/admin/customers", label: "Customers", icon: Users, perm: "customers.view" },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse, perm: "inventory.view" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.view" },
  { href: "/admin/content", label: "Content & promotions", icon: Newspaper, perm: "content.manage" },
  { href: "/admin/staff", label: "Staff", icon: UserCog, perm: "staff.view" },
  { href: "/admin/roles", label: "Roles & permissions", icon: Shield, perm: "roles.manage" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit.view" },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ user, permissions, children, signOut }: { user: { name: string | null; email: string; roles: string[] }; permissions: Permission[]; children: React.ReactNode; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Navigation is filtered for usability only — every page and action re-checks on the server.
  const items = NAV.filter((n) => !n.perm || permissions.includes(n.perm) || (n.perm === "content.manage" && permissions.includes("promotions.manage")));

  const nav = (
    <nav aria-label="Admin" className="space-y-0.5">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 px-3 py-2 text-[13px]", active ? "bg-ivory text-ink" : "text-stone hover:bg-ivory/10 hover:text-ivory")}
          >
            <Icon className="size-4" strokeWidth={1.5} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[248px_1fr]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-[248px] flex-col bg-ink p-4 text-ivory transition-transform lg:sticky lg:top-0 lg:flex lg:h-dvh lg:translate-x-0", open ? "flex translate-x-0" : "hidden -translate-x-full lg:flex")}>
        <div className="mb-8 flex items-center justify-between px-3 pt-2">
          <Link href="/admin" className="text-sm font-medium uppercase tracking-[0.36em]">
            Atelier
          </Link>
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone">Admin</span>
          <button type="button" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="mt-6 border-t border-ivory/10 px-3 pt-4 text-xs">
          <p className="truncate text-ivory">{user.name ?? user.email}</p>
          <p className="truncate text-stone">{user.roles.join(", ").replace(/_/g, " ").toLowerCase()}</p>
          <div className="mt-3 flex gap-4">
            <Link href="/" className="text-stone underline-offset-4 hover:text-ivory hover:underline">
              Storefront
            </Link>
            <form action={signOut}>
              <button className="text-stone underline-offset-4 hover:text-ivory hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-ivory/90 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open admin menu" className="p-2">
            <Menu className="size-5" />
          </button>
          <span className="ml-2 text-sm font-medium uppercase tracking-[0.3em]">Atelier admin</span>
        </header>
        <main id="main" className="px-4 py-8 md:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-medium tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-taupe">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border bg-surface p-5">
      <p className="eyebrow text-taupe">{label}</p>
      <p className="mt-3 text-2xl font-medium tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-taupe">{hint}</p>}
    </div>
  );
}
