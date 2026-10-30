import { notFound } from "next/navigation";
import { db } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/utils";
import { sandboxAdapter } from "@/features/payments/providers/sandbox";
import { SandboxButtons } from "./sandbox-buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox payment", robots: { index: false } };

/** Simulated hosted payment page (development & automated tests only). */
export default async function SandboxPaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!sandboxAdapter.isEnabled()) notFound();
  const payment = await db.payment.findUnique({ where: { id: (await params).paymentId }, include: { order: true } });
  if (!payment || payment.provider !== "SANDBOX") notFound();
  return (
    <div className="container-luxe flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-sm border bg-surface p-8 text-center">
        <p className="eyebrow text-warning">Sandbox gateway · no real money</p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">{formatMoney(payment.amountCents, payment.currency)}</h1>
        <p className="mt-2 text-sm text-taupe">Order {payment.order.number}</p>
        {payment.status === "SUCCEEDED" ? <p className="mt-8 text-sm text-success">This payment is already complete.</p> : <SandboxButtons paymentId={payment.id} />}
      </div>
    </div>
  );
}
