import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { listAdminProducts } from "@/server/services/product-admin.service";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { formatMoney } from "@/lib/utils";
import { garmentArtwork, isSvgSource } from "@/lib/media";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, Pagination, StatusPill } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/form-controls";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { deleteProductAction, setProductFeaturedAction, setProductStatusAction } from "@/features/admin/actions";
import type { GarmentKindName } from "@/types/catalog";

export const metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }> }) {
  const user = await requireAdminPage("products.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, total, pageCount }, categories] = await Promise.all([
    listAdminProducts({ q: sp.q?.slice(0, 80), status: sp.status, categoryId: sp.category, page }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const canWrite = hasPermissions(user, ["products.write"]);
  const canPublish = hasPermissions(user, ["products.publish"]);
  const canDelete = hasPermissions(user, ["products.delete"]);
  const currency = env().STORE_CURRENCY;
  const qs = (p: number) => `/admin/products?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.category ? { category: sp.category } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} products`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/admin/products/new">
                <Plus /> New product
              </Link>
            </Button>
          )
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Search name or SKU" className="h-10 max-w-xs" aria-label="Search products" />
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="h-10 w-40" aria-label="Status">
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </NativeSelect>
        <NativeSelect name="category" defaultValue={sp.category ?? ""} className="h-10 w-48" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
      </form>
      <Table>
        <THead>
          <tr>
            <TH>Product</TH>
            <TH>Category</TH>
            <TH>Price</TH>
            <TH>Stock</TH>
            <TH>3D</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {items.map((p) => {
            const stock = p.variants.reduce((s, v) => s + (v.inventory ? v.inventory.quantity - v.inventory.reserved : 0), 0);
            const img = p.images[0]?.url ?? garmentArtwork(p.garmentKind as GarmentKindName, p.variants[0]?.colorHex ?? "#2b2a28");
            return (
              <TR key={p.id}>
                <TD>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="relative aspect-[3/4] w-9 shrink-0 bg-bone">
                      <Image src={img} alt="" fill sizes="36px" unoptimized={isSvgSource(img)} className="object-cover" />
                    </span>
                    <span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="text-xs text-taupe">{p.brand.name}</span>
                    </span>
                    {p.isFeatured && <Badge tone="ink">Featured</Badge>}
                  </Link>
                </TD>
                <TD className="text-graphite">{p.category.name}</TD>
                <TD className="tabular-nums">
                  {formatMoney(p.salePriceCents ?? p.priceCents, currency)}
                  {p.salePriceCents && <span className="ml-1 text-xs text-taupe line-through">{formatMoney(p.priceCents, currency)}</span>}
                </TD>
                <TD className={stock <= 5 ? "text-warning" : undefined}>{stock}</TD>
                <TD>{p.model3D ? <StatusPill status={p.model3D.status} /> : <span className="text-xs text-taupe">—</span>}</TD>
                <TD>
                  <StatusPill status={p.status} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    {canPublish && (
                      <ActionButton size="sm" variant="ghost" action={setProductStatusAction} input={{ id: p.id, status: p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }}>
                        {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                      </ActionButton>
                    )}
                    {canWrite && (
                      <ActionButton size="sm" variant="ghost" action={setProductFeaturedAction} input={{ id: p.id, isFeatured: !p.isFeatured }}>
                        {p.isFeatured ? "Unfeature" : "Feature"}
                      </ActionButton>
                    )}
                    {canDelete && (
                      <ActionButton size="sm" variant="ghost" className="text-danger" action={deleteProductAction} input={{ id: p.id }} confirm={`Delete ${p.name}? It will be hidden from the store; order history is kept.`}>
                        Delete
                      </ActionButton>
                    )}
                  </div>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={pageCount} hrefFor={qs} />
    </>
  );
}
