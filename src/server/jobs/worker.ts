/**
 * Long-running background worker: `npm run worker`.
 * Run one or more replicas alongside the web app; jobs are claimed with SKIP LOCKED.
 */
import "dotenv/config";
import { logger } from "@/lib/logger";
import { processBatch, scheduleMaintenance } from "./runner";

let running = true;
const IDLE_MS = 2000;

async function main() {
  logger.info("worker started");
  let lastMaintenance = 0;
  while (running) {
    try {
      if (Date.now() - lastMaintenance > 60_000) {
        await scheduleMaintenance();
        lastMaintenance = Date.now();
      }
      const processed = await processBatch(10);
      if (processed === 0) await new Promise((r) => setTimeout(r, IDLE_MS));
    } catch (err) {
      logger.error({ err: (err as Error).message }, "worker loop error");
      await new Promise((r) => setTimeout(r, IDLE_MS * 5));
    }
  }
  logger.info("worker stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    running = false;
  });
}

void main();
