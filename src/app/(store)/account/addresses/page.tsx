import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { AddressActions, AddressDialog } from "../account-forms";

export const metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const user = await requireUserPage("/account/addresses");
  const addresses = await db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AddressDialog trigger={<Button>Add address</Button>} />
      </div>
      {addresses.length === 0 ? (
        <EmptyState title="No saved addresses" description="Add an address to speed up checkout." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col justify-between gap-4 border bg-surface p-5">
              <div className="text-sm leading-relaxed">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium">{a.label ?? a.fullName}</span>
                  {a.isDefault && <Badge tone="ink">Default</Badge>}
                </div>
                <p>{a.fullName}</p>
                <p className="text-graphite">
                  {a.line1}
                  {a.line2 && `, ${a.line2}`}
                  <br />
                  {[a.city, a.region, a.postalCode].filter(Boolean).join(", ")} · {a.country}
                </p>
                <p className="text-taupe">{a.phone}</p>
              </div>
              <div className="flex items-center justify-between">
                <AddressDialog
                  address={{ id: a.id, label: a.label ?? "", fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, region: a.region ?? "", postalCode: a.postalCode ?? "", country: a.country, isDefault: a.isDefault }}
                  trigger={<button className="text-xs underline underline-offset-4">Edit</button>}
                />
                <AddressActions id={a.id} isDefault={a.isDefault} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
