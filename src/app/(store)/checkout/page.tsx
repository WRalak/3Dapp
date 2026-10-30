import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { env } from "@/config/env";
import { enabledPaymentMethods } from "@/features/payments/registry";
import { listCounties } from "@/server/services/delivery.service";
import { formatAddress } from "@/features/delivery/address";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  const counties = await listCounties();
  const [addresses, profile] = user
    ? await Promise.all([
        db.address.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], include: { county: true } }),
        db.customerProfile.findUnique({ where: { userId: user.id } }),
      ])
    : [[], null];
  const methods = enabledPaymentMethods();
  return (
    <div className="container-luxe pt-8 md:pt-14">
      <h1 className="mb-10 text-headline font-medium">Checkout</h1>
      <CheckoutForm
        user={user ? { email: user.email, name: user.name ?? "", phone: profile?.phone ?? "" } : null}
        addresses={addresses.map((a) => ({ id: a.id, label: a.label, fullName: a.fullName, summary: formatAddress({ ...a, county: a.county?.name }), countyId: a.countyId, town: a.town ?? a.city, phone: a.phone, isDefault: a.isDefault }))}
        counties={counties.map((c) => ({ id: c.id, name: c.name }))}
        paymentMethods={methods}
        currency={env().STORE_CURRENCY}
      />
    </div>
  );
}
