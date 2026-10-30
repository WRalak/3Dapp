import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { env } from "@/config/env";
import { db } from "@/lib/db/prisma";
import { enabledPaymentMethods } from "@/features/payments/registry";
import { googleEnabled } from "@/lib/auth/google";
import { redis } from "@/lib/cache/redis";
import { PageHeader } from "@/components/admin/shell";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Settings" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 text-sm last:border-0">
      <span className="text-graphite">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Read-only view of configuration. Secrets live in environment variables and are never displayed. */
export default async function SettingsPage() {
  const user = await requireAdminPage();
  const e = env();
  const [pendingJobs, failedJobs] = await Promise.all([db.job.count({ where: { status: "PENDING" } }), db.job.count({ where: { status: "FAILED" } })]);
  const methods = enabledPaymentMethods();
  const ok = (v: boolean, yes = "Configured", no = "Not configured") => <Badge tone={v ? "success" : "neutral"}>{v ? yes : no}</Badge>;
  return (
    <>
      <PageHeader title="Settings" description="Configuration is managed through environment variables (see .env.example)." />
      <div className="grid gap-8 xl:grid-cols-2">
        <section className="border bg-surface p-6">
          <h2 className="eyebrow mb-3">Your security</h2>
          <Row label="Two-factor authentication" value={ok(user.mfaEnabled, "Enabled", "Disabled")} />
          <Row label="MFA required for staff" value={ok(e.ADMIN_MFA_REQUIRED, "Yes", "No")} />
          <Row label="Staff session lifetime" value={`${e.ADMIN_SESSION_TTL_HOURS} hours`} />
          {!user.mfaEnabled && (
            <Button asChild size="sm" className="mt-4">
              <Link href="/admin-setup/mfa">Enable two-factor authentication</Link>
            </Button>
          )}
          <p className="mt-4 text-xs text-taupe">Manage sessions and password from <Link href="/account/security" className="underline">your account security page</Link>.</p>
        </section>
        <section className="border bg-surface p-6">
          <h2 className="eyebrow mb-3">Commerce</h2>
          <Row label="Currency" value={e.STORE_CURRENCY} />
          <Row label="Tax" value={`${e.TAX_RATE_BPS / 100}% ${e.TAX_INCLUSIVE ? "(inclusive)" : "(exclusive)"}`} />
          <Row label="Payment methods" value={methods.length ? methods.map((m) => m.label).join(", ") : <Badge tone="warning">None enabled</Badge>} />
          <Row label="Google sign-in" value={ok(googleEnabled())} />
        </section>
        <section className="border bg-surface p-6">
          <h2 className="eyebrow mb-3">Infrastructure</h2>
          <Row label="Storage" value={e.STORAGE_DRIVER === "s3" ? `S3/R2 (${e.S3_BUCKET})` : "Local disk"} />
          <Row label="CDN" value={ok(!!e.CDN_URL)} />
          <Row label="Redis" value={ok(redis()?.status === "ready", "Connected", "Unavailable")} />
          <Row label="Email (SMTP)" value={ok(!!e.SMTP_URL, "Configured", "Logging only")} />
          <Row label="Error monitoring (Sentry)" value={ok(!!e.SENTRY_DSN)} />
          <Row label="Background jobs" value={`${pendingJobs} pending · ${failedJobs} failed`} />
        </section>
      </div>
    </>
  );
}
