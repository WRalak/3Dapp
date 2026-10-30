import Link from "next/link";
import Image from "next/image";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { listAdminProducts } from "@/server/services/product-admin.service";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, Pagination, StatusPill } from "@/components/ui/misc";
import { sellerProductStatusAction } from "@/features/marketplace/actions";
import { formatMoney } from "@/lib/utils";
import { isSvgSource } from "@/lib/media";

export const metadata = { title: "Products" };

const APPROVAL = { PENDING_REVIEW: ["warning", "In review"], APPROVED: ["success", "Approved"], REJECTED: ["danger", "Needs changes"] } as const;

export default async function SellerProducts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { seller } = await requireSellerPage("/seller/products");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, pageCount } = await listAdminProducts({ sellerId: seller.id, q: sp.q, status: sp.status, approval: sp.approval, page });
  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} listing(s). New listings and big changes are reviewed before going live.`}
        actions={
          <Button asChild>
            <Link href="/seller/products/new">Add product</Link>
          </Button>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Search name or SKU" className="h-9 border bg-surface px-3" />
        <select name="approval" defaultValue={sp.approval ?? ""} className="h-9 border bg-surface px-2">
          <option value="">Any review status</option>
          <option value="PENDING_REVIEW">In review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Needs changes</option>
        </select>
        <button className="h-9 border px-3">Filter</button>
      </form>
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Product</th>
              <th className="p-3 font-normal">Price</th>
              <th className="p-3 font-normal">Stock</th>
              <th className="p-3 font-normal">Status</th>
              <th className="p-3 font-normal">Review</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-taupe">
                  No products yet.
                </td>
              </tr>
            )}
            {items.map((p) => {
              const stock = p.variants.reduce((s, v) => s + (v.inventory?.quantity ?? 0) - (v.inventory?.reserved ?? 0), 0);
              const [tone, label] = APPROVAL[p.approvalStatus];
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3">
                    <Link href={`/seller/products/${p.id}`} className="flex items-center gap-3">
                      <span className="relative size-12 shrink-0 bg-bone">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="48px" unoptimized={isSvgSource(p.images[0].url)} className="object-cover" />}</span>
                      <span className="font-medium underline-offset-4 hover:underline">{p.name}</span>
                    </Link>
                  </td>
                  <td className="p-3 tabular-nums">{formatMoney(p.salePriceCents ?? p.priceCents)}</td>
                  <td className="p-3 tabular-nums">{stock}</td>
                  <td className="p-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="p-3">
                    <Badge tone={tone}>{label}</Badge>
                    {p.rejectionReason && p.approvalStatus === "REJECTED" && <span className="mt-1 block max-w-xs text-xs text-taupe">{p.rejectionReason}</span>}
                  </td>
                  <td className="p-3 text-right">
                    {p.status !== "PUBLISHED" ? (
                      <ActionButton size="sm" variant="outline" action={sellerProductStatusAction} input={{ id: p.id, status: "PUBLISHED" as const }}>
                        Publish
                      </ActionButton>
                    ) : (
                      <ActionButton size="sm" variant="ghost" action={sellerProductStatusAction} input={{ id: p.id, status: "DRAFT" as const }}>
                        Unpublish
                      </ActionButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} hrefFor={(n) => `/seller/products?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(n) })}`} />
    </>
  );
}
