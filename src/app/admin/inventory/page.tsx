import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shell";
import { FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Badge, Pagination } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { adjustStockAction, setThresholdAction } from "@/features/admin/actions";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; page?: string; tab?: string }> }) {
  const user = await requireAdminPage("inventory.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const canAdjust = hasPermissions(user, ["inventory.adjust"]);
  const q = sp.q?.trim().slice(0, 80);

  if (sp.tab === "movements") {
    const movements = await db.inventoryMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { email: true } }, inventory: { include: { variant: { include: { product: { select: { name: true } } } } } } },
    });
    return (
      <>
        <PageHeader title="Stock movements" description="Every change to stock, newest first" actions={<Button asChild variant="outline" size="sm"><Link href="/admin/inventory">Back to stock levels</Link></Button>} />
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Product</TH>
              <TH>Type</TH>
              <TH className="text-right">Change</TH>
              <TH className="text-right">On hand after</TH>
              <TH>Reason</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <tbody>
            {movements.map((m) => (
              <TR key={m.id}>
                <TD className="text-xs">{formatDate(m.createdAt, { dateStyle: "short", timeStyle: "short" })}</TD>
                <TD>
                  {m.inventory.variant.product.name}
                  <span className="block font-mono text-xs text-taupe">{m.inventory.variant.sku}</span>
                </TD>
                <TD>
                  <Badge tone={m.type === "SALE" ? "ink" : m.type === "RESTOCK" || m.type === "RETURN" ? "success" : "neutral"}>{m.type}</Badge>
                </TD>
                <TD className={`text-right tabular-nums ${m.quantity < 0 ? "text-danger" : "text-success"}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</TD>
                <TD className="text-right tabular-nums">{m.balance}</TD>
                <TD className="text-xs">{m.reason}</TD>
                <TD className="text-xs text-taupe">{m.actor?.email ?? "system"}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </>
    );
  }

  const where: Prisma.ProductVariantWhereInput = {
    deletedAt: null,
    product: { deletedAt: null },
    ...(q ? { OR: [{ sku: { contains: q.toUpperCase() } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  let variants = await db.productVariant.findMany({ where, include: { inventory: true, product: { select: { id: true, name: true } } }, orderBy: [{ product: { name: "asc" } }, { color: "asc" }, { size: "asc" }] });
  if (sp.low) variants = variants.filter((v) => (v.inventory ? v.inventory.quantity - v.inventory.reserved <= v.inventory.lowStockThreshold : true));
  const pageCount = Math.max(1, Math.ceil(variants.length / 50));
  const totals = variants.reduce((s, v) => ({ onHand: s.onHand + (v.inventory?.quantity ?? 0), reserved: s.reserved + (v.inventory?.reserved ?? 0) }), { onHand: 0, reserved: 0 });
  const slice = variants.slice((page - 1) * 50, page * 50);

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${variants.length} variants · ${totals.onHand} units on hand · ${totals.reserved} reserved by unpaid orders`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/inventory?tab=movements">Movement history</Link>
            </Button>
            {hasPermissions(user, ["analytics.view"]) && (
              <Button asChild variant="outline" size="sm">
                <a href="/api/admin/analytics/export?report=inventory">Export report (CSV)</a>
              </Button>
            )}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-3" role="search">
        <Input name="q" defaultValue={q} placeholder="SKU or product" className="h-10 max-w-xs" aria-label="Search inventory" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={!!sp.low} className="accent-ink" /> Low stock only
        </label>
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
      </form>
      <Table>
        <THead>
          <tr>
            <TH>Product</TH>
            <TH>SKU</TH>
            <TH>Variant</TH>
            <TH className="text-right">On hand</TH>
            <TH className="text-right">Reserved</TH>
            <TH className="text-right">Available</TH>
            <TH className="text-right">Low at</TH>
            {canAdjust && <TH className="text-right">Actions</TH>}
          </tr>
        </THead>
        <tbody>
          {slice.map((v) => {
            const inv = v.inventory;
            const available = inv ? inv.quantity - inv.reserved : 0;
            const low = inv ? available <= inv.lowStockThreshold : true;
            return (
              <TR key={v.id}>
                <TD>
                  <Link href={`/admin/products/${v.product.id}`} className="hover:underline">
                    {v.product.name}
                  </Link>
                </TD>
                <TD className="font-mono text-xs">{v.sku}</TD>
                <TD className="text-xs">
                  {v.color} / {v.size}
                </TD>
                <TD className="text-right tabular-nums">{inv?.quantity ?? 0}</TD>
                <TD className="text-right tabular-nums text-taupe">{inv?.reserved ?? 0}</TD>
                <TD className={`text-right tabular-nums ${available <= 0 ? "text-danger" : low ? "text-warning" : ""}`}>{available}</TD>
                <TD className="text-right tabular-nums">{inv?.lowStockThreshold ?? "—"}</TD>
                {canAdjust && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <FormDialog
                        title={`Adjust stock · ${v.sku}`}
                        trigger={<Button size="sm" variant="ghost">Adjust</Button>}
                        action={adjustStockAction}
                        extra={{ variantId: v.id }}
                        defaults={{ type: "RESTOCK", quantity: 1, reason: "" }}
                        fields={[
                          { name: "type", label: "Type", type: "select", options: [{ value: "RESTOCK", label: "Restock (+)" }, { value: "RETURN", label: "Customer return (+)" }, { value: "ADJUSTMENT", label: "Correction (±)" }] },
                          { name: "quantity", label: "Quantity (use negative to reduce)", type: "number" },
                          { name: "reason", label: "Reason", type: "textarea" },
                        ]}
                      />
                      <FormDialog
                        title={`Low-stock threshold · ${v.sku}`}
                        trigger={<Button size="sm" variant="ghost">Threshold</Button>}
                        action={setThresholdAction}
                        extra={{ variantId: v.id }}
                        defaults={{ threshold: inv?.lowStockThreshold ?? 5 }}
                        fields={[{ name: "threshold", label: "Alert when available stock is at or below", type: "number" }]}
                      />
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={pageCount} hrefFor={(p) => `/admin/inventory?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.low ? { low: "1" } : {}), page: String(p) })}`} />
    </>
  );
}
