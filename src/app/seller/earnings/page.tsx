import { requireSellerPage } from "@/lib/auth/seller-guard";
import { sellerEarnings } from "@/server/services/finance.service";
import { env } from "@/config/env";
import { decrypt } from "@/lib/security/crypto";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { ActionButton, FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { cancelPayoutAction, requestPayoutAction, updatePayoutDetailsAction } from "@/features/marketplace/actions";
import { formatDate, formatMoney, maskPhone } from "@/lib/utils";

export const metadata = { title: "Earnings & payouts" };

const LEDGER_LABEL: Record<string, string> = {
  SELLER_EARNING: "Order earnings",
  EARNING_RELEASE: "Released",
  SELLER_DEBIT: "Refund deduction",
  PAYOUT: "Payout",
  ADJUSTMENT: "Adjustment",
};

export default async function SellerEarnings() {
  const { seller } = await requireSellerPage("/seller/earnings");
  const e = env();
  const { wallet, payouts, ledger } = await sellerEarnings(seller.id);
  const p = seller.profile;
  const destination =
    p?.payoutMethod === "BANK_TRANSFER" && p.payoutAccountNumberEnc
      ? `${p.payoutBankName} · ${p.payoutAccountName} · ••••${decrypt(p.payoutAccountNumberEnc, e.ENCRYPTION_KEY).slice(-4)}`
      : p?.payoutMpesaPhone
        ? `M-Pesa ${maskPhone(p.payoutMpesaPhone)}`
        : null;
  const openPayout = payouts.some((x) => x.status === "REQUESTED" || x.status === "PROCESSING");

  return (
    <>
      <PageHeader
        title="Earnings & payouts"
        description={`Earnings become available ${e.SELLER_PAYOUT_HOLD_DAYS} days after delivery. Minimum payout ${formatMoney(e.MIN_PAYOUT_CENTS)}.`}
        actions={
          <FormDialog
            title="Request a payout"
            trigger={
              <Button disabled={!destination || openPayout || wallet.availableCents < e.MIN_PAYOUT_CENTS}>
                Request payout
              </Button>
            }
            fields={[{ name: "amount", label: `Amount (KSh) — available ${formatMoney(wallet.availableCents)}`, type: "number", span: 2 }]}
            defaults={{ amount: Math.floor(wallet.availableCents / 100) }}
            action={requestPayoutAction}
            submitLabel="Request"
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available" value={formatMoney(wallet.availableCents)} hint="Ready to withdraw" />
        <StatCard label="Pending" value={formatMoney(wallet.pendingCents)} hint="Awaiting delivery + hold" />
        <StatCard label="In payout" value={formatMoney(wallet.reservedCents)} />
        <StatCard label="Paid out (all time)" value={formatMoney(wallet.paidOutCents)} hint={`Lifetime earnings ${formatMoney(wallet.lifetimeNetCents)}`} />
      </div>

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border bg-surface p-5 text-sm">
        <div>
          <p className="eyebrow text-taupe">Payout destination</p>
          <p className="mt-1">{destination ?? "Not set — add an M-Pesa number or bank account"}</p>
        </div>
        <FormDialog
          title="Payout details"
          trigger={<Button variant="outline" size="sm">{destination ? "Change" : "Add details"}</Button>}
          fields={[
            { name: "method", label: "Method", type: "select", options: [{ value: "MPESA", label: "M-Pesa" }, { value: "BANK_TRANSFER", label: "Bank transfer" }] },
            { name: "mpesaPhone", label: "M-Pesa number" },
            { name: "bankName", label: "Bank (bank transfer)" },
            { name: "accountName", label: "Account name" },
            { name: "accountNumber", label: "Account number", span: 2, hint: "Stored encrypted. Changes are logged for your security." },
          ]}
          defaults={{ method: p?.payoutMethod ?? "MPESA", mpesaPhone: p?.payoutMpesaPhone ?? "", bankName: p?.payoutBankName ?? "", accountName: p?.payoutAccountName ?? "", accountNumber: "" }}
          action={updatePayoutDetailsAction}
        />
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-medium">Payouts</h2>
          <ul className="divide-y border bg-surface text-sm">
            {payouts.length === 0 && <li className="p-4 text-taupe">No payouts yet.</li>}
            {payouts.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-medium tabular-nums">{formatMoney(x.amountCents)}</span> <span className="text-taupe">to {x.destination}</span>
                  <span className="block text-xs text-taupe">
                    {formatDate(x.requestedAt, { dateStyle: "medium" })}
                    {x.reference && ` · ref ${x.reference}`}
                    {x.failureReason && ` · ${x.failureReason}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill status={x.status} />
                  {x.status === "REQUESTED" && (
                    <ActionButton size="sm" variant="ghost" action={cancelPayoutAction} input={{ id: x.id }}>
                      Cancel
                    </ActionButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium">Statement</h2>
          <ul className="divide-y border bg-surface text-sm">
            {ledger.length === 0 && <li className="p-4 text-taupe">No transactions yet.</li>}
            {ledger.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 p-3">
                <span>
                  {LEDGER_LABEL[l.type] ?? l.type} <span className="text-xs text-taupe">({l.account === "SELLER_PENDING" ? "pending" : "available"})</span>
                  <span className="block text-xs text-taupe">
                    {l.description} · {formatDate(l.createdAt, { dateStyle: "medium" })}
                  </span>
                </span>
                <span className={l.amountCents < 0 ? "tabular-nums text-danger" : "tabular-nums"}>{formatMoney(l.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
