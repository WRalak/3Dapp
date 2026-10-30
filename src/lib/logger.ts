import "server-only";
import pino from "pino";

/**
 * Structured JSON logger. Sensitive keys are redacted before they are written.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "atelier" },
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "cookie",
      "*.cookie",
      "mfaSecret",
      "*.mfaSecret",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function logError(err: unknown, context: Record<string, unknown> = {}) {
  const error = err instanceof Error ? { message: err.message, stack: err.stack, name: err.name } : { message: String(err) };
  logger.error({ ...context, err: error }, error.message);
}
