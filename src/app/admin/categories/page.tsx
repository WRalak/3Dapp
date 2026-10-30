import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog, type FieldConfig } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteCategoryAction, saveBrandAction, saveCategoryAction } from "@/features/admin/actions";

export const metadata = { title: "Categories & brands" };

const BRAND_FIELDS: FieldConfig[] = [
  { name: "name", label: "Name" },
  { name: "slug", label: "Slug", hint: "Optional" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "isFeatured", label: "Feature on homepage", type: "checkbox" },
];

export default async function CategoriesPage() {
  await requireAdminPage("categories.manage");
  const [categories, brands] = await Promise.all([
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { parent: { select: { name: true } }, _count: { select: { products: { where: { deletedAt: null } } } } } }),
    db.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: { where: { deletedAt: null } } } } } }),
  ]);
  const catFields: FieldConfig[] = [
    { name: "name", label: "Name" },
    { name: "slug", label: "Slug", hint: "Optional" },
    { name: "parentId", label: "Parent", type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { name: "sortOrder", label: "Order", type: "number" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ];
  return (
    <>
      <PageHeader title="Categories & brands" />
      <div className="grid gap-10 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Categories</h2>
            <FormDialog title="New category" trigger={<Button size="sm">Add category</Button>} action={saveCategoryAction} defaults={{ sortOrder: 0, isActive: true }} fields={catFields} />
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Parent</TH>
                <TH>Products</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {categories.map((c) => (
                <TR key={c.id}>
                  <TD>
                    {c.name} {!c.isActive && <Badge>Hidden</Badge>}
                    <span className="block font-mono text-xs text-taupe">{c.slug}</span>
                  </TD>
                  <TD>{c.parent?.name ?? "—"}</TD>
                  <TD>{c._count.products}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <FormDialog title="Edit category" trigger={<Button size="sm" variant="ghost">Edit</Button>} action={saveCategoryAction} extra={{ id: c.id }} defaults={{ name: c.name, slug: c.slug, parentId: c.parentId ?? "", sortOrder: c.sortOrder, description: c.description ?? "", isActive: c.isActive }} fields={catFields} />
                      <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteCategoryAction} input={{ id: c.id }} confirm={`Delete ${c.name}?`}>
                        Delete
                      </ActionButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Brands & designers</h2>
            <FormDialog title="New brand" trigger={<Button size="sm">Add brand</Button>} action={saveBrandAction} defaults={{ isFeatured: false }} fields={BRAND_FIELDS} />
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Products</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {brands.map((b) => (
                <TR key={b.id}>
                  <TD>
                    {b.name} {b.isFeatured && <Badge tone="ink">Featured</Badge>}
                  </TD>
                  <TD>{b._count.products}</TD>
                  <TD className="text-right">
                    <FormDialog title="Edit brand" trigger={<Button size="sm" variant="ghost">Edit</Button>} action={saveBrandAction} extra={{ id: b.id }} defaults={{ name: b.name, slug: b.slug, description: b.description ?? "", isFeatured: b.isFeatured }} fields={BRAND_FIELDS} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </>
  );
}
