import "server-only";
import type { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { AppError, type ActionResult } from "./errors";
import { logError } from "./logger";

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Wraps a Server Action: validates input with Zod, runs the handler and converts
 * thrown errors into a typed ActionResult. Unexpected errors are logged and masked.
 */
export function action<S extends z.ZodType, R>(schema: S, handler: (input: z.output<S>) => Promise<R>) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, code: "VALIDATION", error: "Please check the highlighted fields", fieldErrors: zodFieldErrors(parsed.error) };
    }
    try {
      const data = await handler(parsed.data);
      return { ok: true, data };
    } catch (err) {
      return toActionError(err);
    }
  };
}

export function toActionError(err: unknown): ActionResult<never> {
  unstable_rethrow(err); // let redirect()/notFound() propagate
  if (err instanceof AppError) return { ok: false, code: err.code, error: err.message, fieldErrors: err.fieldErrors };
  logError(err, { where: "server-action" });
  return { ok: false, code: "INTERNAL", error: "Something went wrong. Please try again." };
}
