import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/store/auth-forms";
import { FormError } from "@/components/ui/form-controls";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-8 text-4xl font-medium tracking-tight">Choose a new password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <FormError message="This reset link is incomplete." />
          <Link href="/forgot-password" className="mt-6 text-sm underline underline-offset-4">
            Request a new link
          </Link>
        </>
      )}
    </>
  );
}
