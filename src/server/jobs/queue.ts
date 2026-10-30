import "server-only";
import { db, type Tx } from "@/lib/db/prisma";
import type { Job } from "@/generated/prisma/client";

/**
 * Postgres-backed job queue. Jobs are enqueued inside the same transaction as the business
 * write that caused them (transactional outbox), so an email is never sent for an order that
 * rolled back, and a committed order never loses its email.
 */
export type JobPayloads = {
  "email.verify": { userId: string; token: string };
  "email.passwordReset": { userId: string; token: string };
  "email.staffInvite": { invitationId: string; token: string };
  "email.orderConfirmation": { orderId: string };
  "email.orderStatus": { orderId: string; status: string };
  "email.newSignIn": { userId: string; ip: string; userAgent: string };
  "notify.lowStock": { variantId: string };
  "notify.restock": { variantId: string };
  "orders.expireReservations": Record<string, never>;
  "payments.reconcile": { paymentId: string };
  "assets.process": { assetId: string };
};
export type JobType = keyof JobPayloads;

export async function enqueue<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  opts: { tx?: Tx; runAt?: Date; maxAttempts?: number } = {},
) {
  const client = opts.tx ?? db;
  return client.job.create({
    data: { type, payload: payload as object, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 },
  });
}

/** Atomically claims due jobs. SKIP LOCKED lets many workers run concurrently without double-processing. */
export async function claimJobs(workerId: string, limit = 10): Promise<Job[]> {
  return db.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE (status = 'PENDING' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

export async function completeJob(id: string) {
  await db.job.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null } });
}

export async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(2 ** job.attempts * 15_000, 60 * 60_000);
  await db.job.update({
    where: { id: job.id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      lastError: message.slice(0, 2000),
      runAt: new Date(Date.now() + backoffMs),
      lockedAt: null,
      lockedBy: null,
    },
  });
}
