import type { Metadata } from "next";
import { requireSellerPage } from "@/lib/auth/seller-guard";
import { AdminShell } from "@/components/admin/shell";
import { logoutAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: { default: "Seller", template: "%s | 3Dapp Seller" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Seller portal: every page below re-resolves the seller from the session (never from the URL). */
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const { user, seller } = await requireSellerPage();
  return (
    <AdminShell variant="seller" storeName={seller.businessName} user={{ name: user.name, email: user.email, roles: user.roles }} permissions={[]} signOut={logoutAction}>
      {children}
    </AdminShell>
  );
}
