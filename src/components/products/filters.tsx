"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import type { Facets } from "@/types/catalog";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "best-selling", label: "Best selling" },
  { value: "rating", label: "Top rated" },
];

function useFilterParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const update = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const toggle = (key: string, value: string) =>
    update((p) => {
      const current = new Set((p.get(key) ?? "").split(",").filter(Boolean));
      if (current.has(value)) current.delete(value);
      else current.add(value);
      if (current.size) p.set(key, [...current].join(","));
      else p.delete(key);
    });
  const set = (key: string, value: string | null) => update((p) => (value ? p.set(key, value) : p.delete(key)));
  return { params, list, toggle, set, update, pending };
}

function FilterPanel({ facets }: { facets: Facets }) {
  const { params, list, toggle, set } = useFilterParams();
  const [min, setMin] = useState(params.get("minPrice") ?? "");
  const [max, setMax] = useState(params.get("maxPrice") ?? "");
  const sizes = list("size");
  const colors = list("color");
  const brands = list("brand");

  return (
    <div className="space-y-10">
      <section>
        <h3 className="eyebrow mb-4 text-graphite">Category</h3>
        <ul className="space-y-2 text-sm">
          <li>
            <button type="button" onClick={() => set("category", null)} className={cn("hover:text-ink", !params.get("category") ? "text-ink underline underline-offset-4" : "text-graphite")}>
              All
            </button>
          </li>
          {facets.categories.map((c) => (
            <li key={c.slug}>
              <button type="button" onClick={() => set("category", c.slug)} className={cn("hover:text-ink", params.get("category") === c.slug ? "text-ink underline underline-offset-4" : "text-graphite")}>
                {c.name} <span className="text-taupe">({c.count})</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="eyebrow mb-4 text-graphite">Size</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {facets.sizes.map((s) => (
            <button key={s} type="button" aria-pressed={sizes.includes(s)} onClick={() => toggle("size", s)} className={cn("h-9 border text-xs", sizes.includes(s) ? "border-ink bg-ink text-ivory" : "hover:border-ink")}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-4 text-graphite">Colour</h3>
        <div className="flex flex-wrap gap-2">
          {facets.colors.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              aria-label={c.name}
              aria-pressed={colors.includes(c.name)}
              onClick={() => toggle("color", c.name)}
              className={cn("size-8 rounded-full border-2 p-0.5", colors.includes(c.name) ? "border-ink" : "border-transparent hover:border-stone")}
            >
              <span className="block size-full rounded-full border border-ink/10" style={{ backgroundColor: c.hex }} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-4 text-graphite">Price</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set("minPrice", min || null);
            set("maxPrice", max || null);
          }}
        >
          <input value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`${facets.priceRange.min}`} aria-label="Minimum price" className="h-10 w-full border bg-surface px-3 text-sm" />
          <span className="text-taupe">–</span>
          <input value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`${facets.priceRange.max}`} aria-label="Maximum price" className="h-10 w-full border bg-surface px-3 text-sm" />
          <Button type="submit" size="sm" variant="outline">
            Go
          </Button>
        </form>
      </section>

      <section>
        <h3 className="eyebrow mb-4 text-graphite">Designer</h3>
        <ul className="space-y-2 text-sm">
          {facets.brands.map((b) => (
            <li key={b.slug}>
              <label className="flex cursor-pointer items-center gap-3 text-graphite">
                <input type="checkbox" checked={brands.includes(b.slug)} onChange={() => toggle("brand", b.slug)} className="size-4 accent-ink" />
                {b.name}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-3 text-graphite">
          <input type="checkbox" checked={params.get("onSale") === "1"} onChange={(e) => set("onSale", e.target.checked ? "1" : null)} className="size-4 accent-ink" />
          On sale
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-graphite">
          <input type="checkbox" checked={params.get("has3d") === "1"} onChange={(e) => set("has3d", e.target.checked ? "1" : null)} className="size-4 accent-ink" />
          Available in 3D
        </label>
      </section>
    </div>
  );
}

export function ShopToolbar({ facets, total }: { facets: Facets; total: number }) {
  const { params, set, update, pending } = useFilterParams();
  const [open, setOpen] = useState(false);
  const active = ["category", "size", "color", "brand", "minPrice", "maxPrice", "onSale", "has3d", "q"].filter((k) => params.get(k));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y py-3">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm lg:hidden">
            <SlidersHorizontal className="size-4" /> Filters{active.length ? ` (${active.length})` : ""}
          </button>
          <p className="text-sm text-taupe" aria-live="polite">
            {pending ? "Updating…" : `${total} piece${total === 1 ? "" : "s"}`}
          </p>
          {active.length > 0 && (
            <button type="button" onClick={() => update((p) => active.forEach((k) => p.delete(k)))} className="inline-flex items-center gap-1 text-xs text-graphite underline underline-offset-4">
              <X className="size-3" /> Clear all
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-taupe">Sort</span>
          <NativeSelect value={params.get("sort") ?? "featured"} onChange={(e) => set("sort", e.target.value === "featured" ? null : e.target.value)} className="h-9 w-48" aria-label="Sort products">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <Drawer open={open} onOpenChange={setOpen} side="left" title="Filters" footer={<Button className="w-full" onClick={() => setOpen(false)}>Show {total} results</Button>}>
        <div className="p-6">
          <FilterPanel facets={facets} />
        </div>
      </Drawer>
    </>
  );
}

export function FilterSidebar({ facets }: { facets: Facets }) {
  return (
    <aside className="hidden lg:block" aria-label="Product filters">
      <FilterPanel facets={facets} />
    </aside>
  );
}
