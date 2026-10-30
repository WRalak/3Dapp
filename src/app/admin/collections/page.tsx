import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog, type FieldConfig } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteCollectionAction, saveCollectionAction } from "@/features/admin/actions";

export const metadata = { title: "Collections" };

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name" },
  { name: "slug", label: "Slug", hint: "Optional" },
  { name: "description", label: "Description", type: "textarea" },
  { name: "heroImageUrl", label: "Hero image URL", span: 2 },
  { name: "sortOrder", label: "Order", type: "number" },
  { name: "isFeatured", label: "Feature on homepage", type: "checkbox" },
  { name: "isActive", label: "Active", type: "checkbox" },
];

export default async function CollectionsAdminPage() {
  await requireAdminPage("collections.manage");
  const collections = await db.collection.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader
        title="Collections"
        description="Assign products to collections from the product editor."
        actions={<FormDialog title="New collection" trigger={<Button>Add collection</Button>} action={saveCollectionAction} defaults={{ sortOrder: 0, isActive: true, isFeatured: false }} fields={FIELDS} />}
      />
      <Table>
        <THead>
          <tr>
            <TH>Collection</TH>
            <TH>Products</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {collections.map((c) => (
            <TR key={c.id}>
              <TD>
                {c.name}
                <span className="block text-xs text-taupe">{c.description}</span>
              </TD>
              <TD>{c._count.products}</TD>
              <TD>
                <div className="flex gap-1">
                  {c.isActive ? <Badge tone="success">Live</Badge> : <Badge>Hidden</Badge>}
                  {c.isFeatured && <Badge tone="ink">Featured</Badge>}
                </div>
              </TD>
              <TD className="text-right">
                <div className="flex justify-end gap-1">
                  <FormDialog title="Edit collection" trigger={<Button size="sm" variant="ghost">Edit</Button>} action={saveCollectionAction} extra={{ id: c.id }} defaults={{ name: c.name, slug: c.slug, description: c.description ?? "", heroImageUrl: c.heroImageUrl ?? "", sortOrder: c.sortOrder, isFeatured: c.isFeatured, isActive: c.isActive }} fields={FIELDS} />
                  <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteCollectionAction} input={{ id: c.id }} confirm={`Delete ${c.name}? Products are not deleted.`}>
                    Delete
                  </ActionButton>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
