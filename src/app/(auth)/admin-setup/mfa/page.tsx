import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { MfaSetupForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Set up two-factor authentication", robots: { index: false } };

export default async function MfaSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isStaff) redirect("/account");
  if (user.mfaEnabled) redirect(user.mfaVerified ? "/admin" : "/mfa");
  return (
    <>
      <p className="eyebrow mb-3 text-taupe">Required for staff</p>
      <h1 className="text-4xl font-medium tracking-tight">Secure your account</h1>
      <p className="mb-8 mt-3 text-sm text-taupe">Administrative access requires two-factor authentication.</p>
      <MfaSetupForm />
    </>
  );
}
