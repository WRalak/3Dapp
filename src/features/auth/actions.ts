"use server";

import { redirect } from "next/navigation";
import { action } from "@/lib/action";
import { env } from "@/config/env";
import { createSession, destroyCurrentSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/guards";
import { requestContext } from "@/lib/security/request";
import { safeRedirect } from "@/lib/utils";
import { totpUri } from "@/lib/security/totp";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import {
  acceptInvitation,
  authenticate,
  beginMfaEnrollment,
  confirmMfaEnrollment,
  registerCustomer,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyMfaChallenge,
} from "@/server/services/auth.service";
import { mergeGuestCart } from "@/server/services/cart.service";
import { z } from "zod";

function postLoginDestination(user: { isStaff: boolean; mfaEnabled: boolean }, next?: string) {
  if (user.isStaff) {
    if (user.mfaEnabled) return `/mfa?next=${encodeURIComponent(safeRedirect(next, "/admin"))}`;
    if (env().ADMIN_MFA_REQUIRED) return "/admin-setup/mfa";
    return safeRedirect(next, "/admin");
  }
  return safeRedirect(next, "/account");
}

export const registerAction = action(registerSchema, async (input) => {
  const ctx = await requestContext();
  const user = await registerCustomer(input, ctx);
  await createSession(user, ctx);
  await mergeGuestCart(user.id);
  return { redirectTo: "/account?welcome=1" };
});

export const loginAction = action(loginSchema, async (input) => {
  const ctx = await requestContext();
  const user = await authenticate(input.email, input.password, ctx);
  await createSession(user, { ...ctx, mfaVerified: false });
  await mergeGuestCart(user.id);
  return { redirectTo: postLoginDestination(user, input.next) };
});

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/");
}

export const forgotPasswordAction = action(forgotPasswordSchema, async ({ email }) => {
  await requestPasswordReset(email, await requestContext());
  return { message: "If an account exists for that email, a reset link is on its way." };
});

export const resetPasswordAction = action(resetPasswordSchema, async ({ token, password }) => {
  await resetPassword(token, password);
  return { redirectTo: "/login?reset=1" };
});

export const resendVerificationAction = action(z.object({}), async () => {
  const user = await requireUser();
  await resendVerification(user.id);
  return { message: "Verification email sent." };
});

export const verifyMfaAction = action(mfaCodeSchema, async ({ code, next }) => {
  const user = await requireUser();
  await verifyMfaChallenge(user.id, user.sessionId, code, await requestContext());
  return { redirectTo: safeRedirect(next, "/admin") };
});

export const beginMfaSetupAction = action(z.object({}), async () => {
  const user = await requireUser();
  if (!user.isStaff) throw new Error("MFA enrolment is for staff accounts");
  const secret = await beginMfaEnrollment(user.id);
  return { secret, uri: totpUri(secret, user.email) };
});

export const confirmMfaSetupAction = action(mfaCodeSchema, async ({ code }) => {
  const user = await requireUser();
  await confirmMfaEnrollment(user.id, user.sessionId, code);
  return { redirectTo: "/admin" };
});

export const acceptInvitationAction = action(acceptInvitationSchema, async ({ token, name, password }) => {
  const user = await acceptInvitation(token, name, password);
  const ctx = await requestContext();
  await createSession(user, { ...ctx, mfaVerified: false });
  return { redirectTo: env().ADMIN_MFA_REQUIRED ? "/admin-setup/mfa" : "/admin" };
});
