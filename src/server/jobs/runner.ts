import "server-only";
import { hostname } from "node:os";
import { logError, logger } from "@/lib/logger";
import { claimJobs, completeJob, enqueue, failJob } from "./queue";
import { runJob } from "./handlers";
import { db } from "@/lib/db/prisma";

const workerId = `${hostname()}:${process.pid}`;

/** Processes one batch of due jobs. Used by the long-running worker and the cron endpoint. */
export async function processBatch(limit = 10) {
  const jobs = await claimJobs(workerId, limit);
  for (const job of jobs) {
    const started = Date.now();
    try {
      await runJob(job.type, job.payload);
      await completeJob(job.id);
      logger.info({ jobId: job.id, type: job.type, ms: Date.now() - started }, "job completed");
    } catch (err) {
      logError(err, { jobId: job.id, type: job.type, attempt: job.attempts });
      await failJob(job, err);
    }
  }
  return jobs.length;
}

/** Periodic maintenance: make sure reservation expiry runs even if individual jobs were lost. */
export async function scheduleMaintenance() {
  const pending = await db.job.count({ where: { type: "orders.expireReservations", status: "PENDING" } });
  if (pending === 0) await enqueue("orders.expireReservations", {}, { runAt: new Date(Date.now() + 5 * 60_000) });
  const release = await db.job.count({ where: { type: "finance.releaseEarnings", status: "PENDING" } });
  if (release === 0) await enqueue("finance.releaseEarnings", {}, { runAt: new Date(Date.now() + 60 * 60_000) });
}
