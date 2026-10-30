import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/config/env";

/**
 * Single pooled Prisma client per process. In development the instance is kept on
 * globalThis so hot reloads don't exhaust Postgres connections.
 */
function create() {
  const e = env();
  const adapter = new PrismaPg({
    connectionString: e.DATABASE_URL,
    max: e.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({
    adapter,
    log: e.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof create> };

export const db = globalForPrisma.prisma ?? create();
if (env().NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
