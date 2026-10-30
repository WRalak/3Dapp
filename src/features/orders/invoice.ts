import { site } from "@/config/site";
import { formatDate, formatMoney } from "@/lib/utils";

interface InvoiceOrder {
  number: string;
  placedAt: Date;
  paidAt: Date | null;
  customerName: string;
  email: string;
  phone: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  shippingMethod: string;
  shippingAddress: unknown;
  items: { productName: string; variantLabel: string; sku: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  payments: { provider: string; status: string; providerReference: string | null }[];
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Self-contained, print-ready invoice (Print → Save as PDF). All values are HTML-escaped. */
export function renderInvoiceHtml(o: InvoiceOrder) {
  const m = (c: number) => esc(formatMoney(c, o.currency));
  const addr = (o.shippingAddress ?? {}) as Record<string, string | undefined>;
  const paid = o.payments.find((p) => p.status === "SUCCEEDED" || p.status.includes("REFUNDED"));
  const rows = o.items
    .map((i) => `<tr><td>${esc(i.productName)}<div class="muted">${esc(i.variantLabel)} · ${esc(i.sku)}</div></td><td class="r">${i.quantity}</td><td class="r">${m(i.unitPriceCents)}</td><td class="r">${m(i.totalCents)}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(o.number)}</title>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#161513;max-width:760px;margin:48px auto;padding:0 24px;font-size:13px}
h1{font-weight:500;font-size:28px;letter-spacing:-.02em;margin:0}
.brand{letter-spacing:.3em;text-transform:uppercase;font-size:12px}
.muted{color:#8a8277;font-size:11px;margin-top:2px}
.grid{display:flex;justify-content:space-between;gap:24px;margin:40px 0}
table{width:100%;border-collapse:collapse;margin-top:16px}
th{text-align:left;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8a8277;border-bottom:1px solid #161513;padding:8px 0}
td{padding:12px 0;border-bottom:1px solid #e2dcd2;vertical-align:top}
.r{text-align:right}
.totals{margin-left:auto;width:280px;margin-top:24px}
.totals div{display:flex;justify-content:space-between;padding:4px 0}
.totals .grand{border-top:1px solid #161513;margin-top:8px;padding-top:12px;font-size:16px}
@media print{body{margin:0}}
</style></head><body>
<div class="grid" style="margin-top:0"><div class="brand">${esc(site.name)}</div><div class="r"><h1>Invoice</h1><div class="muted">${esc(o.number)}</div></div></div>
<div class="grid">
<div><div class="muted">BILLED TO</div><p>${esc(o.customerName)}<br>${esc(o.email)}<br>${esc(o.phone)}</p></div>
<div><div class="muted">DELIVER TO</div><p>${addr.pickup ? "Studio pickup" : [addr.line1, addr.line2, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean).map(esc).join("<br>")}</p></div>
<div class="r"><div class="muted">DATE</div><p>${esc(formatDate(o.placedAt))}</p><div class="muted">PAYMENT</div><p>${esc(paid?.provider ?? "—")}${o.paidAt ? `<br>Paid ${esc(formatDate(o.paidAt))}` : ""}</p></div>
</div>
<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<div><span>Subtotal</span><span>${m(o.subtotalCents)}</span></div>
${o.discountCents ? `<div><span>Discount${o.couponCode ? ` (${esc(o.couponCode)})` : ""}</span><span>−${m(o.discountCents)}</span></div>` : ""}
<div><span>Shipping (${esc(o.shippingMethod)})</span><span>${m(o.shippingCents)}</span></div>
<div><span>Tax</span><span>${m(o.taxCents)}</span></div>
<div class="grand"><span>Total</span><span>${m(o.totalCents)}</span></div>
</div>
<p class="muted" style="margin-top:48px">${esc(site.name)} · ${esc(site.supportEmail)}</p>
</body></html>`;
}
