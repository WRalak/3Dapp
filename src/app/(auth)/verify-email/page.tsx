import type { Metadata } from "next";
import Link from "next/link";
import { VerifyEmailButton } from "./verify-button";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

/** Verification requires an explicit click so link scanners/prefetchers can't consume the token. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-4xl font-medium tracking-tight">Confirm your email</h1>
      {token ? <VerifyEmailButton token={token} /> : <p className="text-sm text-taupe">This link is incomplete. <Link className="underline" href="/account">Go to your account</Link> to resend it.</p>}
    </>
  );
}
