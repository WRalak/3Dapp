/** Typed application errors that map cleanly onto HTTP responses and form results. */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT"
  | "OUT_OF_STOCK"
  | "BAD_REQUEST"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT: 402,
  OUT_OF_STOCK: 409,
  BAD_REQUEST: 400,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const unauthenticated = (msg = "Please sign in to continue") => new AppError("UNAUTHENTICATED", msg);
export const forbidden = (msg = "You do not have permission to do that") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const badRequest = (msg: string) => new AppError("BAD_REQUEST", msg);
export const rateLimited = (msg = "Too many attempts. Please wait and try again.") => new AppError("RATE_LIMITED", msg);

/** Result envelope returned by Server Actions to client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: ErrorCode; fieldErrors?: Record<string, string[]> };
