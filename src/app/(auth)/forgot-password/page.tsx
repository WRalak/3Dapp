import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-4xl font-medium tracking-tight">Reset your password</h1>
      <p className="mb-8 mt-3 text-sm text-taupe">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <Link href="/login" className="mt-8 text-sm underline underline-offset-4">
        Back to sign in
      </Link>
    </>
  );
}
