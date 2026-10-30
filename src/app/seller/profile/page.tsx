import Link from "next/link";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { listCounties } from "@/server/services/delivery.service";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { sellerBrandAction, updateStoreProfileAction } from "@/features/marketplace/actions";

export const metadata = { title: "Store profile" };

export default async function SellerProfilePage() {
  const { seller } = await requireSellerPage("/seller/profile");
  const [counties, brands] = await Promise.all([listCounties(), db.brand.findMany({ where: { sellerId: seller.id }, select: { id: true, name: true } })]);
  const p = seller.profile!;
  return (
    <>
      <PageHeader
        title="Store profile"
        description="This is what customers see on your designer page."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/designers/${seller.slug}`} target="_blank">
              View my store
            </Link>
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-2 border bg-surface p-6 text-sm">
          <p className="text-2xl font-medium">{seller.businessName}</p>
          <p className="text-taupe">
            {seller.town}, {seller.county?.name} · {p.email} · {p.phone}
          </p>
          <p className="whitespace-pre-line pt-2 text-graphite">{p.description}</p>
          {p.returnPolicy && <p className="whitespace-pre-line pt-2 text-xs text-taupe">Returns: {p.returnPolicy}</p>}
          <div className="pt-4">
            <FormDialog
              title="Edit store profile"
              trigger={<Button size="sm">Edit profile</Button>}
              fields={[
                { name: "businessName", label: "Store name" },
                { name: "contactName", label: "Contact person" },
                { name: "email", label: "Email", type: "email" },
                { name: "phone", label: "Phone" },
                { name: "countyId", label: "County", type: "select", options: counties.map((c) => ({ value: c.id, label: c.name })) },
                { name: "town", label: "Town" },
                { name: "description", label: "About your brand", type: "textarea" },
                { name: "returnPolicy", label: "Returns & exchanges policy", type: "textarea" },
                { name: "logoUrl", label: "Logo image URL" },
                { name: "coverUrl", label: "Cover image URL" },
                { name: "website", label: "Website (https)" },
                { name: "instagram", label: "Instagram handle" },
                { name: "kraPin", label: "KRA PIN" },
                { name: "registrationNumber", label: "Business registration no." },
              ]}
              defaults={{
                businessName: seller.businessName,
                contactName: p.contactName,
                email: p.email,
                phone: p.phone,
                countyId: seller.countyId ?? "",
                town: seller.town ?? "",
                description: p.description,
                returnPolicy: p.returnPolicy ?? "",
                logoUrl: p.logoUrl ?? "",
                coverUrl: p.coverUrl ?? "",
                website: p.website ?? "",
                instagram: p.instagram ?? "",
                kraPin: p.kraPin ?? "",
                registrationNumber: p.registrationNumber ?? "",
              }}
              extra={{ categories: p.categories.length ? p.categories : ["other"] }}
              action={updateStoreProfileAction}
            />
          </div>
        </section>
        <section className="border bg-surface p-6 text-sm">
          <h2 className="eyebrow mb-3">Labels</h2>
          <p className="mb-4 text-taupe">Labels group your products (e.g. your main line and a bridal line).</p>
          <ul className="mb-4 space-y-1">
            {brands.map((b) => (
              <li key={b.id}>{b.name}</li>
            ))}
            {brands.length === 0 && <li className="text-taupe">No labels yet.</li>}
          </ul>
          <FormDialog title="Add a label" trigger={<Button size="sm" variant="outline">Add label</Button>} fields={[{ name: "name", label: "Label name" }]} defaults={{ name: "" }} action={sellerBrandAction} />
        </section>
      </div>
    </>
  );
}
