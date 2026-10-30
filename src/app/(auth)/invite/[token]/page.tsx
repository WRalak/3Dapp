import type { Metadata } from "next";
import { db } from "@/lib/db/prisma";
import { sha256 } from "@/lib/security/crypto";
import { AcceptInvitationForm } from "@/components/store/auth-forms";
import { FormError } from "@/components/ui/form-controls";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.adminInvitation.findUnique({ where: { tokenHash: sha256(token) } });
  const valid = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
  return (
    <>
      <p className="eyebrow mb-3 text-taupe">Staff invitation</p>
      <h1 className="mb-8 text-4xl font-medium tracking-tight">Join Mtindo</h1>
      {valid ? <AcceptInvitationForm token={token} email={invite.email} /> : <FormError message="This invitation is invalid, has expired or has already been used." />}
    </>
  );
}
