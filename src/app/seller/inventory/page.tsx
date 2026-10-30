import { requireSellerPage } from "@/lib/auth/seller-guard";
import { db } from "@/lib/db/prisma";
import { PageHeader } from "@/components/admin/shell";
import { FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { sellerAdjustStockAction } from "@/features/marketplace/actions";

export const metadata = { title: "Inventory" };

export default async function SellerInventory({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { seller } = await requireSellerPage("/seller/inventory");
  const { q } = await searchParams;
  const variants = await db.productVariant.findMany({
    where: {
      deletedAt: null,
      product: { sellerId: seller.id, deletedAt: null },
      ...(q ? { OR: [{ sku: { contains: q.toUpperCase() } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { inventory: true, product: { select: { name: true } } },
    orderBy: [{ product: { name: "asc" } }, { size: "asc" }],
    take: 300,
  });
  return (
    <>
      <PageHeader title="Inventory" description="Stock reserved by unpaid orders is released automatically if payment isn't completed within 30 minutes." />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Search name or SKU" className="h-9 border bg-surface px-3 text-sm" />
      </form>
      <div className="overflow-x-auto border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs text-taupe">
            <tr>
              <th className="p-3 font-normal">Product</th>
              <th className="p-3 font-normal">SKU</th>
              <th className="p-3 font-normal">In stock</th>
              <th className="p-3 font-normal">Reserved</th>
              <th className="p-3 font-normal">Available</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const qty = v.inventory?.quantity ?? 0;
              const res = v.inventory?.reserved ?? 0;
              const avail = qty - res;
              return (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="p-3">
                    {v.product.name}
                    <span className="block text-xs text-taupe">
                      {v.color} · {v.size}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{v.sku}</td>
                  <td className="p-3 tabular-nums">{qty}</td>
                  <td className="p-3 tabular-nums">{res}</td>
                  <td className="p-3">{avail <= (v.inventory?.lowStockThreshold ?? 0) ? <Badge tone={avail <= 0 ? "danger" : "warning"}>{avail}</Badge> : <span className="tabular-nums">{avail}</span>}</td>
                  <td className="p-3 text-right">
                    <FormDialog
                      title={`Adjust ${v.sku}`}
                      trigger={<Button size="sm" variant="outline">Adjust</Button>}
                      fields={[
                        { name: "type", label: "Type", type: "select", options: [{ value: "RESTOCK", label: "Restock (add)" }, { value: "ADJUSTMENT", label: "Correction (+/−)" }, { value: "RETURN", label: "Customer return (add)" }] },
                        { name: "quantity", label: "Quantity", type: "number", hint: "Use a negative number to remove stock" },
                        { name: "reason", label: "Reason", span: 2 },
                      ]}
                      defaults={{ type: "RESTOCK", quantity: 1, reason: "" }}
                      extra={{ variantId: v.id }}
                      action={sellerAdjustStockAction}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
