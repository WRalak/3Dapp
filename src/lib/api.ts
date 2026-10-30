import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AppError, badRequest, forbidden } from "./errors";
import { logError } from "./logger";
import { zodFieldErrors } from "./action";
import { isSameOrigin } from "./security/request";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Route Handler wrapper: consistent JSON errors, CSRF origin check for cookie-authenticated
 * mutations, and no leaking of internal error details.
 */
export function route<C = unknown>(handler: Handler<C>, opts: { csrf?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && opts.csrf !== false && !isSameOrigin(req)) throw forbidden("Cross-site request rejected");
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code, fieldErrors: err.fieldErrors }, { status: err.status });
  }
  logError(err, { where: "route-handler" });
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid request", zodFieldErrors(parsed.error));
  return parsed.data;
}
