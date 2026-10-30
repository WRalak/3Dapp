import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { googleEnabled } from "@/lib/auth/google";
import { RegisterForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <>
      <h1 className="text-4xl font-medium tracking-tight">Create an account</h1>
      <p className="mb-8 mt-3 text-sm text-taupe">
        Already have one?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
      <RegisterForm googleEnabled={googleEnabled()} />
    </>
  );
}
