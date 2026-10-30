import { requireSellerPage } from "@/lib/auth/seller-guard";
import { listCounties, sellerZones } from "@/server/services/delivery.service";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog, type FieldConfig } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { deleteMethodAction, deleteZoneAction, saveMethodAction, saveZoneAction } from "@/features/marketplace/actions";
import { etaLabel } from "@/features/delivery/availability";
import { formatMoney } from "@/lib/utils";

export const metadata = { title: "Delivery" };

const TYPE_LABEL: Record<string, string> = { SAME_DAY: "Same-day", NEXT_DAY: "Next-day", STANDARD: "Standard", COURIER: "Courier", PICKUP: "Pickup", SELLER_ARRANGED: "Seller-arranged" };

const methodFields: FieldConfig[] = [
  { name: "type", label: "Type", type: "select", options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
  { name: "name", label: "Name shown to customers", hint: "e.g. Boda boda within Nairobi CBD" },
  { name: "price", label: "Price (KSh)", type: "number" },
  { name: "freeOver", label: "Free over (KSh, optional)", type: "number" },
  { name: "minDays", label: "Min days", type: "number", hint: "0 = today" },
  { name: "maxDays", label: "Max days", type: "number" },
  { name: "cutoffHour", label: "Same-day cut-off hour (0–23, EAT)", type: "number", hint: "Orders after this roll to tomorrow" },
  { name: "pickupAddress", label: "Pickup address (pickup only)", span: 2 },
  { name: "isActive", label: "Active", type: "checkbox" },
];

export default async function SellerDelivery() {
  const { seller } = await requireSellerPage("/seller/delivery");
  const [zones, counties] = await Promise.all([sellerZones(seller.id), listCounties()]);
  const countyOptions = counties.map((c) => ({ value: c.id, label: c.name }));
  const zoneFields: FieldConfig[] = [
    { name: "name", label: "Zone name", hint: "e.g. Nairobi Metro, Coast, Upcountry" },
    { name: "towns", label: "Limit to towns (optional)", hint: "Comma separated. Leave empty to cover whole counties." },
    { name: "countyIds", label: "Counties", type: "select", multiple: true, span: 2, hint: "Hold Ctrl/⌘ to select several" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ].map((f) => (f.name === "countyIds" ? { ...f, options: countyOptions } : f)) as FieldConfig[];

  return (
    <>
      <PageHeader
        title="Delivery"
        description="Each zone covers counties (optionally specific towns) and offers one or more delivery options. Pickup is offered to every customer."
        actions={<FormDialog title="New delivery zone" trigger={<Button>Add zone</Button>} fields={zoneFields} defaults={{ name: "", towns: "", countyIds: seller.countyId ? [seller.countyId] : [], isActive: true }} action={saveZoneAction} />}
      />
      {zones.length === 0 ? (
        <EmptyState title="No delivery zones yet" description={`Start with your home county${seller.county ? ` (${seller.county.name})` : ""}: add a zone, then a same-day or standard option and a pickup point.`} />
      ) : (
        <div className="space-y-6">
          {zones.map((z) => (
            <section key={z.id} className="border bg-surface">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div>
                  <h2 className="font-medium">
                    {z.name} {!z.isActive && <Badge tone="neutral">inactive</Badge>}
                  </h2>
                  <p className="mt-1 text-xs text-taupe">
                    {z.counties.map((c) => c.county.name).join(", ")}
                    {z.towns.length > 0 && ` · towns: ${z.towns.join(", ")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <FormDialog
                    title={`Edit ${z.name}`}
                    trigger={<Button size="sm" variant="outline">Edit</Button>}
                    fields={zoneFields}
                    defaults={{ name: z.name, towns: z.towns.join(", "), countyIds: z.counties.map((c) => c.countyId), isActive: z.isActive }}
                    extra={{ id: z.id }}
                    action={saveZoneAction}
                  />
                  <ActionButton size="sm" variant="ghost" action={deleteZoneAction} input={{ id: z.id }} confirm="Delete this zone and its delivery options?">
                    Delete
                  </ActionButton>
                </div>
              </header>
              <ul className="divide-y text-sm">
                {z.methods.length === 0 && <li className="p-4 text-taupe">No delivery options in this zone yet.</li>}
                {z.methods.map((mth) => (
                  <li key={mth.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <span>
                      <span className="font-medium">{mth.name}</span> <Badge tone="neutral">{TYPE_LABEL[mth.type]}</Badge> {!mth.isActive && <Badge tone="warning">off</Badge>}
                      <span className="block text-xs text-taupe">
                        {mth.priceCents ? formatMoney(mth.priceCents) : "Free"}
                        {mth.freeOverCents != null && ` · free over ${formatMoney(mth.freeOverCents)}`} · {etaLabel(mth.minDays, mth.maxDays)}
                        {mth.cutoffHour != null && ` · order by ${mth.cutoffHour}:00`}
                        {mth.pickupAddress && ` · ${mth.pickupAddress}`}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <FormDialog
                        title={`Edit ${mth.name}`}
                        trigger={<Button size="sm" variant="outline">Edit</Button>}
                        fields={methodFields}
                        defaults={{ type: mth.type, name: mth.name, price: mth.priceCents / 100, freeOver: mth.freeOverCents == null ? "" : mth.freeOverCents / 100, minDays: mth.minDays, maxDays: mth.maxDays, cutoffHour: mth.cutoffHour ?? "", pickupAddress: mth.pickupAddress ?? "", isActive: mth.isActive }}
                        extra={{ id: mth.id, zoneId: z.id }}
                        action={saveMethodAction}
                      />
                      <ActionButton size="sm" variant="ghost" action={deleteMethodAction} input={{ id: mth.id }} confirm="Remove this delivery option?">
                        Remove
                      </ActionButton>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t p-4">
                <FormDialog
                  title="New delivery option"
                  trigger={<Button size="sm" variant="outline">Add delivery option</Button>}
                  fields={methodFields}
                  defaults={{ type: "STANDARD", name: "", price: 300, freeOver: "", minDays: 1, maxDays: 3, cutoffHour: "", pickupAddress: "", isActive: true }}
                  extra={{ zoneId: z.id }}
                  action={saveMethodAction}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
