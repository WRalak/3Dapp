import "server-only";

/**
 * Shipping-provider abstraction. Today sellers deliver themselves or hand parcels to a courier
 * and enter the tracking reference ("manual"). A courier integration (e.g. a Kenyan last-mile
 * API) implements the same interface — book the shipment, return its tracking reference, and
 * post status updates to a verified webhook that appends ShipmentTracking rows.
 */
export interface ShipmentBooking {
  sellerOrderId: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

export interface ShippingProvider {
  id: string;
  label: string;
  createShipment(input: ShipmentBooking): Promise<{ carrier: string; trackingNumber: string | null; trackingUrl: string | null }>;
}

const manual: ShippingProvider = {
  id: "manual",
  label: "Seller delivery / courier of choice",
  async createShipment(input) {
    const url = input.trackingUrl && /^https:\/\//.test(input.trackingUrl) ? input.trackingUrl : null;
    return { carrier: input.carrier?.trim() || "Seller delivery", trackingNumber: input.trackingNumber?.trim() || null, trackingUrl: url };
  },
};

const PROVIDERS: Record<string, ShippingProvider> = { manual };

export function getShippingProvider(id: string): ShippingProvider {
  return PROVIDERS[id] ?? manual;
}

export const SHIPPING_PROVIDERS = Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label }));
