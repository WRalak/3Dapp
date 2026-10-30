import { route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/guards";
import { notFound, unauthenticated } from "@/lib/errors";
import { getOrderForViewer } from "@/server/services/order.service";
import { renderInvoiceHtml } from "@/features/orders/invoice";

export const dynamic = "force-dynamic";

/** Downloadable invoice. Only the order owner or staff with orders.view may access it. */
export const GET = route(async (req, { params }: { params: Promise<{ number: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  const order = await getOrderForViewer((await params).number, user);
  if (!order || order.paymentStatus === "UNPAID") throw notFound("Invoice");
  const html = renderInvoiceHtml(order);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      ...(download ? { "content-disposition": `attachment; filename="invoice-${order.number}.html"` } : {}),
    },
  });
});
