import { requireAdminPage } from "@/lib/auth/guards";
import { listRoles } from "@/server/services/admin.service";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin/shell";
import { RoleMatrix } from "./role-matrix";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  await requireAdminPage("roles.manage");
  const roles = await listRoles();
  const groups = Object.entries(PERMISSIONS).reduce<Record<string, { key: string; description: string }[]>>((acc, [key, meta]) => {
    (acc[meta.group] ??= []).push({ key, description: meta.description });
    return acc;
  }, {});
  return (
    <>
      <PageHeader title="Roles & permissions" description="Each role is a bundle of permissions. Every admin page and action checks permissions on the server." />
      <RoleMatrix
        groups={groups}
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, users: r._count.users, permissions: r.permissions.map((p) => p.permission.key) }))}
      />
    </>
  );
}
