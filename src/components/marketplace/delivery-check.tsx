"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { api } from "@/lib/fetcher";
import { etaLabel } from "@/features/delivery/availability";
import { formatMoney } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/form-controls";
import type { CartDeliveryOption } from "@/types/cart";

const KEY = "mtindo_county";
const noopSubscribe = () => () => undefined;
function readStoredCounty() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** "Delivers to …?" — remembers the shopper's county locally (a convenience, not trusted data). */
export function DeliveryCheck({ sellerId, counties: given, amountCents, currency = "KES", compact }: { sellerId: string; counties?: { id: string; name: string }[]; amountCents: number; currency?: string; compact?: boolean }) {
  const { data: fetched } = useQuery({ queryKey: ["counties"], queryFn: () => api<{ id: string; name: string }[]>("/api/counties"), enabled: !given, staleTime: Infinity });
  const counties = given ?? fetched ?? [];
  const stored = useSyncExternalStore(noopSubscribe, readStoredCounty, () => "");
  const [chosen, setCounty] = useState<string | null>(null);
  const county = chosen ?? (counties.some((c) => c.id === stored) ? stored : "");
  const { data, isFetching } = useQuery({
    queryKey: ["delivery", sellerId, county, amountCents],
    queryFn: () => api<{ options: CartDeliveryOption[] }>(`/api/delivery?${new URLSearchParams({ seller: sellerId, county, amount: String(amountCents) })}`),
    enabled: !!county,
    staleTime: 60_000,
  });
  const options = data?.options ?? null;
  const loading = isFetching;

  const delivery = options?.filter((o) => o.type !== "PICKUP") ?? [];
  const pickup = options?.find((o) => o.type === "PICKUP");

  return (
    <div className={compact ? "space-y-2 text-xs" : "space-y-3 text-sm"}>
      <label className="flex items-center gap-2">
        <Truck className="size-4 shrink-0" aria-hidden />
        <span className="shrink-0">Deliver to</span>
        <NativeSelect
          value={county}
          aria-label="Your county"
          onChange={(e) => {
            setCounty(e.target.value);
            try {
              localStorage.setItem(KEY, e.target.value);
            } catch {
              /* ignore */
            }
          }}
          className="h-9 min-w-0 flex-1 py-1 text-sm"
        >
          <option value="">Choose your county</option>
          {counties.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      {county && (
        <div aria-live="polite" className="text-graphite">
          {loading && !options ? (
            <p className="text-taupe">Checking…</p>
          ) : delivery.length ? (
            <ul className="space-y-1">
              {delivery.slice(0, compact ? 2 : 4).map((o) => (
                <li key={o.methodId} className="flex justify-between gap-3">
                  <span>
                    {o.name} · {etaLabel(o.etaMinDays, o.etaMaxDays).toLowerCase()}
                  </span>
                  <span className="tabular-nums">{o.priceCents ? formatMoney(o.priceCents, currency) : "Free"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-warning">This designer doesn&apos;t deliver to your county yet.</p>
          )}
          {pickup && <p className="mt-1 text-taupe">Or collect: {pickup.pickupAddress}</p>}
        </div>
      )}
    </div>
  );
}
