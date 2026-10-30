/**
 * Delivery availability and pricing (pure). Each seller configures their own zones
 * (counties, optionally narrowed to towns) and methods; nothing assumes sellers share
 * delivery arrangements.
 */
export type DeliveryTypeName = "SAME_DAY" | "NEXT_DAY" | "STANDARD" | "COURIER" | "PICKUP" | "SELLER_ARRANGED";

export interface ZoneRule {
  id: string;
  isActive: boolean;
  countyIds: string[];
  towns: string[];
  methods: MethodRule[];
}

export interface MethodRule {
  id: string;
  type: DeliveryTypeName;
  name: string;
  priceCents: number;
  freeOverCents: number | null;
  minDays: number;
  maxDays: number;
  cutoffHour: number | null;
  pickupAddress: string | null;
  isActive: boolean;
}

export interface DeliveryOption {
  methodId: string;
  type: DeliveryTypeName;
  name: string;
  priceCents: number;
  etaMinDays: number;
  etaMaxDays: number;
  pickupAddress: string | null;
}

const normTown = (t: string) => t.trim().toLowerCase();

export function zoneCovers(zone: Pick<ZoneRule, "countyIds" | "towns" | "isActive">, countyId: string, town?: string | null) {
  if (!zone.isActive || !zone.countyIds.includes(countyId)) return false;
  if (zone.towns.length === 0) return true;
  return !!town && zone.towns.map(normTown).includes(normTown(town));
}

/** Current hour in East Africa Time (UTC+3, no DST). */
export function eatHour(now = new Date()) {
  return (now.getUTCHours() + 3) % 24;
}

/**
 * Options a seller can offer to an address. Pickup methods are always offered (the customer
 * travels); delivery methods only where a zone covers the county/town.
 */
export function deliveryOptionsFor(zones: ZoneRule[], countyId: string | null, town: string | null, merchandiseCents: number, now = new Date()): DeliveryOption[] {
  const out = new Map<string, DeliveryOption>();
  for (const zone of zones) {
    for (const m of zone.methods) {
      if (!m.isActive || !zone.isActive) continue;
      const isPickup = m.type === "PICKUP";
      if (!isPickup && (!countyId || !zoneCovers(zone, countyId, town))) continue;
      let { minDays, maxDays } = m;
      if (m.type === "SAME_DAY" && m.cutoffHour != null && eatHour(now) >= m.cutoffHour) {
        minDays = Math.max(1, minDays);
        maxDays = Math.max(minDays, maxDays);
      }
      const free = m.freeOverCents != null && merchandiseCents >= m.freeOverCents;
      const option: DeliveryOption = {
        methodId: m.id,
        type: m.type,
        name: m.name,
        priceCents: free ? 0 : m.priceCents,
        etaMinDays: minDays,
        etaMaxDays: maxDays,
        pickupAddress: m.pickupAddress,
      };
      // If several zones expose the same method, keep the cheapest.
      const existing = out.get(m.id);
      if (!existing || option.priceCents < existing.priceCents) out.set(m.id, option);
    }
  }
  return [...out.values()].sort((a, b) => a.priceCents - b.priceCents || a.etaMinDays - b.etaMinDays);
}

export function etaLabel(min: number, max: number) {
  if (max === 0) return "Today";
  if (min === max) return min === 1 ? "Tomorrow" : `${min} days`;
  return `${min}–${max} days`;
}
