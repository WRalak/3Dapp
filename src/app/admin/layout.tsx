import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/guards";
import { AdminShell } from "@/components/admin/shell";
import { logoutAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | 3Dapp Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  return (
    <AdminShell user={{ name: user.name, email: user.email, roles: user.roles }} permissions={user.permissions} signOut={logoutAction}>
      {children}
    </AdminShell>
  );
}
