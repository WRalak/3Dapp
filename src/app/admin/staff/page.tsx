import Link from "next/link";
import { requireAdminPage, hasPermissions } from "@/lib/auth/guards";
import { listInvitations, listStaff } from "@/server/services/admin.service";
import { ALL_PERMISSIONS, STAFF_ROLE_KEYS } from "@/lib/auth/permissions";
import { db } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/shell";
import { ActionButton, FormDialog } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge, StatusPill } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { inviteStaffAction, resetStaffAccessAction, revokeInvitationAction, setStaffAccessAction, setStaffStatusAction } from "@/features/admin/actions";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireAdminPage("staff.view");
  const canManage = hasPermissions(user, ["staff.manage"]);
  const isSuper = user.roles.includes("SUPER_ADMIN");
  const [staff, invites, activity] = await Promise.all([
    listStaff(),
    listInvitations(),
    db.auditLog.groupBy({ by: ["actorId"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) }, actor: { isStaff: true } }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const activityBy = new Map(activity.map((a) => [a.actorId, a]));
  const roleOptions = STAFF_ROLE_KEYS.filter((r) => isSuper || r !== "SUPER_ADMIN").map((r) => ({ value: r, label: r.replace(/_/g, " ").toLowerCase() }));
  const permOptions = ALL_PERMISSIONS.map((p) => ({ value: p, label: p }));

  return (
    <>
      <PageHeader
        title="Staff"
        description="Administrators and their access. Changes take effect on the next request."
        actions={
          canManage && (
            <FormDialog
              title="Invite a staff member"
              trigger={<Button>Invite staff</Button>}
              action={inviteStaffAction}
              defaults={{ email: "", roleKeys: [] }}
              fields={[
                { name: "email", label: "Email", type: "email", span: 2 },
                { name: "roleKeys", label: "Roles (Ctrl/⌘ for several)", type: "select", multiple: true, options: roleOptions, span: 2 },
              ]}
              submitLabel="Send invitation"
            />
          )
        }
      />
      <Table>
        <THead>
          <tr>
            <TH>Member</TH>
            <TH>Roles</TH>
            <TH>Extra permissions</TH>
            <TH>MFA</TH>
            <TH>Activity (30d)</TH>
            <TH>Status</TH>
            {canManage && <TH className="text-right">Actions</TH>}
          </tr>
        </THead>
        <tbody>
          {staff.map((s) => {
            const act = activityBy.get(s.id);
            const self = s.id === user.id;
            return (
              <TR key={s.id}>
                <TD>
                  <span className="font-medium">{s.name ?? "—"}</span>
                  {self && <Badge className="ml-2">You</Badge>}
                  <span className="block text-xs text-taupe">{s.email}</span>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r.roleId} tone={r.role.key === "SUPER_ADMIN" ? "ink" : "neutral"}>
                        {r.role.name}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="text-xs text-taupe">{s.permissions.map((p) => p.permission.key).join(", ") || "—"}</TD>
                <TD>{s.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}</TD>
                <TD className="text-xs">
                  {act ? (
                    <Link href={`/admin/audit?actor=${s.id}`} className="underline underline-offset-4">
                      {act._count._all} actions · last {formatDate(act._max.createdAt!)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <StatusPill status={s.status} />
                </TD>
                {canManage && (
                  <TD className="text-right">
                    {!self && (
                      <div className="flex justify-end gap-1">
                        <FormDialog
                          title={`Access for ${s.email}`}
                          trigger={<Button size="sm" variant="ghost">Access</Button>}
                          action={setStaffAccessAction}
                          extra={{ userId: s.id }}
                          defaults={{ roleKeys: s.roles.map((r) => r.role.key), permissions: s.permissions.map((p) => p.permission.key) }}
                          fields={[
                            { name: "roleKeys", label: "Roles", type: "select", multiple: true, options: roleOptions, span: 2 },
                            { name: "permissions", label: "Additional permissions", type: "select", multiple: true, options: permOptions, span: 2 },
                          ]}
                        />
                        <ActionButton size="sm" variant="ghost" action={resetStaffAccessAction} input={{ id: s.id }} confirm="Sign this person out everywhere, reset their MFA and email a password reset link?">
                          Reset access
                        </ActionButton>
                        {s.status === "SUSPENDED" ? (
                          <ActionButton size="sm" variant="ghost" action={setStaffStatusAction} input={{ id: s.id, status: "ACTIVE" as const, reason: "" }} prompt={{ label: "Reason", key: "reason" }}>
                            Reactivate
                          </ActionButton>
                        ) : (
                          <ActionButton size="sm" variant="ghost" className="text-danger" action={setStaffStatusAction} input={{ id: s.id, status: "SUSPENDED" as const, reason: "" }} prompt={{ label: "Reason for suspending", key: "reason" }}>
                            Suspend
                          </ActionButton>
                        )}
                      </div>
                    )}
                  </TD>
                )}
              </TR>
            );
          })}
        </tbody>
      </Table>

      {invites.length > 0 && (
        <section className="mt-10">
          <h2 className="eyebrow mb-3">Pending invitations</h2>
          <Table>
            <THead>
              <tr>
                <TH>Email</TH>
                <TH>Invited by</TH>
                <TH>Expires</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </tr>
            </THead>
            <tbody>
              {invites.map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD className="text-xs">{i.invitedBy.email}</TD>
                  <TD className="text-xs">{formatDate(i.expiresAt, { dateStyle: "medium", timeStyle: "short" })}</TD>
                  {canManage && (
                    <TD className="text-right">
                      <ActionButton size="sm" variant="ghost" action={revokeInvitationAction} input={{ id: i.id }} confirm="Revoke this invitation?">
                        Revoke
                      </ActionButton>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
