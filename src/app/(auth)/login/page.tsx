import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { googleEnabled } from "@/lib/auth/google";
import { safeRedirect } from "@/lib/utils";
import { LoginForm } from "@/components/store/auth-forms";
import { FormError, FormSuccess } from "@/components/ui/form-controls";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  oauth_state: "Your sign-in session expired. Please try again.",
  oauth_failed: "We couldn't sign you in with Google. Please try again.",
  google_unavailable: "Google sign-in isn't available right now.",
  suspended: "This account has been suspended.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(safeRedirect(sp.next, user.isStaff ? "/admin" : "/account"));
  return (
    <>
      <h1 className="text-4xl font-medium tracking-tight">Welcome back</h1>
      <p className="mb-8 mt-3 text-sm text-taupe">
        New to Atelier?{" "}
        <Link href="/register" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
      {sp.error && <div className="mb-5"><FormError message={ERRORS[sp.error] ?? "Sign-in failed."} /></div>}
      {sp.reset && <div className="mb-5"><FormSuccess message="Password updated — please sign in." /></div>}
      <LoginForm next={sp.next} googleEnabled={googleEnabled()} />
    </>
  );
}
