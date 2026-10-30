import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeRedirect } from "@/lib/utils";
import { MfaChallengeForm } from "@/components/store/auth-forms";
import { logoutAction } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Two-factor authentication", robots: { index: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mfaEnabled) redirect(user.isStaff ? "/admin-setup/mfa" : "/account");
  if (user.mfaVerified) redirect(safeRedirect(next, "/admin"));
  return (
    <>
      <h1 className="text-4xl font-medium tracking-tight">Two-factor check</h1>
      <p className="mb-8 mt-3 text-sm text-taupe">Enter the 6-digit code from your authenticator app to continue to the dashboard.</p>
      <MfaChallengeForm next={next} />
      <form action={logoutAction} className="mt-8">
        <button className="text-sm text-graphite underline underline-offset-4">Sign out</button>
      </form>
    </>
  );
}
