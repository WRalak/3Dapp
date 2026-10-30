"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Dialog as D } from "radix-ui";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { isSvgSource } from "@/lib/media";
import { useUiStore } from "@/stores/ui-store";
import { Price } from "@/components/ui/misc";
import type { Paginated, ProductCardData } from "@/types/catalog";

export function SearchDialog() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const router = useRouter();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", deferred],
    queryFn: () => api<Paginated<ProductCardData>>(`/api/products?q=${encodeURIComponent(deferred)}&limit=6`),
    enabled: open && deferred.length >= 2,
    staleTime: 60_000,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <D.Content className="fixed inset-x-0 top-0 z-50 bg-ivory shadow-xl outline-none">
          <D.Title className="sr-only">Search the catalogue</D.Title>
          <D.Description className="sr-only">Type to search products, brands and materials</D.Description>
          <div className="container-luxe py-6">
            <form onSubmit={submit} role="search" className="flex items-center gap-4 border-b border-ink pb-3">
              <Search className="size-5 text-taupe" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search coats, linen, Maison Ardent…"
                className="h-12 flex-1 bg-transparent text-xl tracking-tight outline-none placeholder:text-stone md:text-2xl"
                aria-label="Search"
                maxLength={100}
              />
              <D.Close className="p-2 text-graphite hover:text-ink" aria-label="Close search">
                <X className="size-5" />
              </D.Close>
            </form>
            <div className="min-h-24 py-6" aria-live="polite">
              {deferred.length < 2 ? (
                <p className="text-sm text-taupe">Try “wool coat”, “silk” or “sneakers”.</p>
              ) : isFetching && !data ? (
                <p className="text-sm text-taupe">Searching…</p>
              ) : data && data.items.length === 0 ? (
                <p className="text-sm text-taupe">No pieces match “{deferred}”.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {data?.items.map((p) => (
                    <li key={p.id}>
                      <Link href={`/products/${p.slug}`} onClick={() => setOpen(false)} className="group block">
                        <div className="relative aspect-[3/4] overflow-hidden bg-bone">
                          {p.image && <Image src={p.image} alt={p.name} fill sizes="200px" unoptimized={isSvgSource(p.image)} className="object-cover transition-transform duration-700 group-hover:scale-105" />}
                        </div>
                        <p className="mt-2 truncate text-sm">{p.name}</p>
                        <Price cents={p.priceCents} compareAt={p.compareAtCents} className="text-xs text-graphite" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
