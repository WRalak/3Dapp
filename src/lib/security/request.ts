import "server-only";
import { headers } from "next/headers";

export interface RequestContext {
  ip: string;
  userAgent: string;
}

function ipFrom(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  return { ip: ipFrom(h), userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

export function requestContextFrom(req: Request): RequestContext {
  return { ip: ipFrom(req.headers), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) };
}

/**
 * CSRF defence for cookie-authenticated Route Handlers: state-changing requests must come
 * from our own origin. (Server Actions already enforce an Origin/Host match in Next.js.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
