import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { forbidden, unauthenticated } from "@/lib/errors";
import { getSessionRecord } from "./session";
import { isPermission, type Permission, type RoleKey } from "./permissions";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isStaff: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  sessionId: string;
  mfaVerified: boolean;
  roles: RoleKey[];
  permissions: Permission[];
}

/** Resolve effective permissions = union(role permissions, direct grants). Pure for testability. */
export function resolvePermissions(
  roles: { permissions: { permission: { key: string } }[] }[],
  direct: { permission: { key: string } }[],
): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) for (const rp of role.permissions) if (isPermission(rp.permission.key)) set.add(rp.permission.key);
  for (const up of direct) if (isPermission(up.permission.key)) set.add(up.permission.key);
  return [...set].sort();
}

export function hasPermissions(user: Pick<AuthUser, "permissions" | "isStaff"> | null, required: Permission[]): boolean {
  if (!user || !user.isStaff) return false;
  return required.every((p) => user.permissions.includes(p));
}

/** True when the staff member has satisfied MFA (or MFA is not enforced). */
export function staffMfaSatisfied(user: Pick<AuthUser, "isStaff" | "mfaVerified">, mfaRequired: boolean) {
  return !user.isStaff || !mfaRequired || user.mfaVerified;
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSessionRecord();
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    isStaff: u.isStaff,
    emailVerified: !!u.emailVerifiedAt,
    mfaEnabled: u.mfaEnabled,
    sessionId: session.id,
    mfaVerified: session.mfaVerified,
    roles: u.roles.map((r) => r.role.key as RoleKey),
    permissions: u.isStaff ? resolvePermissions(u.roles.map((r) => r.role), u.permissions) : [],
  };
});

// ── For Server Actions and Route Handlers (throw typed errors) ───────────────

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

/**
 * Server-side authorisation for every admin operation. Requires an active staff account,
 * a completed MFA challenge (when enforced) and every listed permission.
 */
export async function requirePermission(...required: Permission[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isStaff) throw forbidden();
  if (!staffMfaSatisfied(user, env().ADMIN_MFA_REQUIRED)) throw forbidden("Multi-factor authentication required");
  if (!hasPermissions(user, required)) throw forbidden();
  return user;
}

// ── For Server Component pages (redirect instead of throwing) ───────────────

export async function requireUserPage(next: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdminPage(...required: Permission[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/admin`);
  if (!user.isStaff) redirect("/");
  if (env().ADMIN_MFA_REQUIRED && !user.mfaVerified) {
    redirect(user.mfaEnabled ? "/mfa?next=/admin" : "/admin-setup/mfa");
  }
  if (!hasPermissions(user, required)) redirect("/admin?denied=1");
  return user;
}
