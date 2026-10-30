/** Snapshot stored on orders (JSON) — self-contained so it survives address edits/deletes. */
export interface AddressSnapshot {
  fullName?: string;
  phone?: string;
  countyId?: string | null;
  county?: string | null;
  town?: string | null;
  estate?: string | null;
  building?: string | null;
  line1?: string | null;
  directions?: string | null;
  country?: string;
  // Legacy (pre-marketplace) fields
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  pickup?: boolean;
}

export function addressLines(a: AddressSnapshot | null | undefined): string[] {
  if (!a) return [];
  return [a.building, a.line1, a.estate, a.line2, a.town ?? a.city, a.county ?? a.region, a.postalCode].filter((x): x is string => !!x && x.trim() !== "");
}

export function formatAddress(a: AddressSnapshot | null | undefined) {
  return addressLines(a).join(", ");
}
