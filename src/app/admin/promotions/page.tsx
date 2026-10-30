import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { FormDialog, type FieldConfig } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { savePromotionAction } from "@/features/marketplace/actions";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata = { title: "Campaigns" };

export default async function Promotions() {
  await requireAdminPage("promotions.manage");
  const [promos, sellers, categories] = await Promise.all([
    db.promotion.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.seller.findMany({ where: { status: "APPROVED" }, select: { id: true, businessName: true }, orderBy: { businessName: "asc" } }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const sellerName = new Map(sellers.map((s) => [s.id, s.businessName]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const fields: FieldConfig[] = [
    { name: "name", label: "Campaign name", hint: "e.g. Jamhuri Day edit" },
    { name: "type", label: "Discount", type: "select", options: [{ value: "PERCENTAGE", label: "Percent off" }, { value: "FIXED", label: "KSh off per item" }] },
    { name: "value", label: "Value (% or KSh)", type: "number" },
    { name: "endsAt", label: "Ends", type: "date" },
    { name: "sellerIds", label: "Only these sellers (seller-funded)", type: "select", multiple: true, options: sellers.map((s) => ({ value: s.id, label: s.businessName })), hint: "Empty = platform-funded, all sellers" },
    { name: "categoryIds", label: "Only these categories", type: "select", multiple: true, options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { name: "description", label: "Description", type: "textarea" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ];
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Automatic discounts. Seller-scoped campaigns are funded by those sellers (agree with them first); platform-wide ones are absorbed by Mtindo and never reduce seller earnings."
        actions={<FormDialog title="New campaign" trigger={<Button>New campaign</Button>} fields={fields} defaults={{ name: "", type: "PERCENTAGE", value: 10, endsAt: "", sellerIds: [], categoryIds: [], description: "", isActive: true }} action={savePromotionAction} />}
      />
      {promos.length === 0 ? (
        <EmptyState title="No campaigns" />
      ) : (
        <ul className="divide-y border bg-surface text-sm">
          {promos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                <span className="font-medium">{p.name}</span> {p.isActive ? <Badge tone="success">active</Badge> : <Badge tone="neutral">off</Badge>} <Badge tone={p.sellerIds.length ? "warning" : "neutral"}>{p.sellerIds.length ? "seller-funded" : "platform-funded"}</Badge>
                <span className="block text-xs text-taupe">
                  {p.type === "PERCENTAGE" ? `${p.value}% off` : `${formatMoney(p.value)} off per item`}
                  {p.sellerIds.length > 0 && ` · ${p.sellerIds.map((id) => sellerName.get(id) ?? "?").join(", ")}`}
                  {p.categoryIds.length > 0 && ` · ${p.categoryIds.map((id) => catName.get(id) ?? "?").join(", ")}`}
                  {p.endsAt && ` · ends ${formatDate(p.endsAt, { dateStyle: "medium" })}`}
                </span>
              </span>
              <FormDialog
                title={`Edit ${p.name}`}
                trigger={<Button size="sm" variant="outline">Edit</Button>}
                fields={fields}
                defaults={{ name: p.name, type: p.type, value: p.type === "FIXED" ? p.value / 100 : p.value, endsAt: p.endsAt?.toISOString().slice(0, 10) ?? "", sellerIds: p.sellerIds, categoryIds: p.categoryIds, description: p.description ?? "", isActive: p.isActive }}
                extra={{ id: p.id }}
                action={savePromotionAction}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
