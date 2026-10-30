"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import {
  acceptInvitationAction,
  beginMfaSetupAction,
  confirmMfaSetupAction,
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  verifyMfaAction,
} from "@/features/auth/actions";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, FormSuccess, Input } from "@/components/ui/form-controls";

/** Applies server field errors to the form and returns the top-level message. */
function useServerResult<T extends Record<string, unknown>>(setError: (name: never, e: { message: string }) => void) {
  const [error, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const handle = (res: ActionResult<T & { redirectTo?: string; message?: string }>) => {
    if (!res.ok) {
      setErr(res.error);
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) setError(k as never, { message: v[0]! });
      return false;
    }
    setErr(null);
    if (res.data.message) setSuccess(res.data.message);
    if (res.data.redirectTo) {
      router.push(res.data.redirectTo);
      router.refresh();
    }
    return true;
  };
  return { error, success, handle };
}

export function GoogleButton({ next }: { next?: string }) {
  return (
    <Button asChild variant="outline" className="w-full">
      <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-4">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        Continue with Google
      </a>
    </Button>
  );
}

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled: boolean }) {
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", next } });
  const { error, handle } = useServerResult(form.setError as never);
  const onSubmit = form.handleSubmit(async (v) => void handle(await loginAction(v)));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {googleEnabled && (
        <>
          <GoogleButton next={next} />
          <p className="text-center text-xs uppercase tracking-[0.16em] text-taupe">or</p>
        </>
      )}
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-graphite underline underline-offset-4">
          Forgot password?
        </Link>
      </div>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const form = useForm<z.input<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", marketingOptIn: false },
  });
  const { error, handle } = useServerResult(form.setError as never);
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => void handle(await registerAction(v)));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {googleEnabled && (
        <>
          <GoogleButton />
          <p className="text-center text-xs uppercase tracking-[0.16em] text-taupe">or</p>
        </>
      )}
      <Field label="Full name" error={e.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </Field>
      <Field label="Email" error={e.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={e.password?.message} hint="10+ characters, mixed case, a number or symbol">
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirm password" error={e.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <Checkbox label="Send me editorial notes and early access" {...form.register("marketingOptIn")} />
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { error, success, handle } = useServerResult(form.setError as never);
  const onSubmit = form.handleSubmit(async (v) => void handle(await forgotPasswordAction(v)));
  if (success) return <FormSuccess message={success} />;
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const form = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token, password: "", confirmPassword: "" } });
  const { error, handle } = useServerResult(form.setError as never);
  const onSubmit = form.handleSubmit(async (v) => void handle(await resetPasswordAction(v)));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="New password" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirm password" error={form.formState.errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Update password
      </Button>
    </form>
  );
}

export function MfaChallengeForm({ next }: { next?: string }) {
  const form = useForm<z.input<typeof mfaCodeSchema>>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: "", next } });
  const { error, handle } = useServerResult(form.setError as never);
  const onSubmit = form.handleSubmit(async (v) => void handle(await verifyMfaAction(v)));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Authentication code" error={form.formState.errors.code?.message}>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus className="text-center text-2xl tracking-[0.5em]" {...form.register("code")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Verify
      </Button>
    </form>
  );
}

export function MfaSetupForm() {
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof mfaCodeSchema>>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: "" } });
  const { error, handle } = useServerResult(form.setError as never);

  useEffect(() => {
    start(async () => {
      const res = await beginMfaSetupAction({});
      if (res.ok) setSecret(res.data);
      else setLoadError(res.error);
    });
  }, []);

  const onSubmit = form.handleSubmit(async (v) => void handle(await confirmMfaSetupAction(v)));
  if (loadError) return <FormError message={loadError} />;
  if (pending || !secret) return <p className="text-sm text-taupe">Generating your secret…</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-graphite">
        <li>Open an authenticator app (1Password, Google Authenticator, Authy).</li>
        <li>
          Add an account using this setup key:
          <code className="mt-2 block break-all bg-bone px-3 py-2 font-mono text-xs tracking-wider text-ink">{secret.secret.match(/.{1,4}/g)?.join(" ")}</code>
          <a href={secret.uri} className="mt-2 inline-block text-xs underline underline-offset-4">
            Open in authenticator app
          </a>
        </li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <Field label="Authentication code" error={form.formState.errors.code?.message}>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="text-center text-2xl tracking-[0.5em]" {...form.register("code")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Enable two-factor authentication
      </Button>
    </form>
  );
}

export function AcceptInvitationForm({ token, email }: { token: string; email: string }) {
  const form = useForm<z.input<typeof acceptInvitationSchema>>({ resolver: zodResolver(acceptInvitationSchema), defaultValues: { token, name: "", password: "", confirmPassword: "" } });
  const { error, handle } = useServerResult(form.setError as never);
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => void handle(await acceptInvitationAction(v)));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Email">
        <Input value={email} readOnly disabled />
      </Field>
      <Field label="Full name" error={e.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </Field>
      <Field label="Password" error={e.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field label="Confirm password" error={e.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <FormError message={error} />
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Join the team
      </Button>
    </form>
  );
}
