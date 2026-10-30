import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import { requestContext } from "@/lib/security/request";
import { logger } from "@/lib/logger";

/**
 * Append-only audit trail of privileged actions. The AuditLog table rejects UPDATE/DELETE
 * at the database level, so entries cannot be tampered with through the application.
 */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
  tx?: Tx,
) {
  let ctx = { ip: "system", userAgent: "" };
  try {
    ctx = await requestContext();
  } catch {
    /* outside a request (jobs, scripts) */
  }
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata: (metadata ?? undefined) as object | undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  logger.info({ actorId, action, entityType, entityId }, "audit");
}
