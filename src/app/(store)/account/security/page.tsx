import { requireUserPage } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";
import { formatDate } from "@/lib/utils";
import { PasswordForm, SessionActions } from "../account-forms";

export const metadata = { title: "Security" };

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export default async function SecurityPage() {
  const user = await requireUserPage("/account/security");
  const [record, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, mfaEnabled: true } }),
    db.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-6 text-xl font-medium tracking-tight">Password</h2>
        <PasswordForm hasPassword={!!record.passwordHash} />
      </section>
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">Active sessions</h2>
          {sessions.length > 1 && <SessionActions />}
        </div>
        <ul className="divide-y border-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div>
                <p>{device(s.userAgent)}</p>
                <p className="text-xs text-taupe">
                  {s.ip} · last active {formatDate(s.lastSeenAt, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <SessionActions sessionId={s.id} current={s.id === user.sessionId} />
            </li>
          ))}
        </ul>
      </section>
      {user.isStaff && <p className="text-sm text-taupe">Two-factor authentication: {record.mfaEnabled ? "enabled" : "not enabled"}.</p>}
    </div>
  );
}
