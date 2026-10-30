import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/config/env";

/**
 * Single pooled Prisma client per process, created lazily on first use so that importing
 * this module (e.g. during `next build` without a database) has no side effects. In
 * development the instance is kept on globalThis so hot reloads don't exhaust connections.
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

type Client = ReturnType<typeof create>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

function client(): Client {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = create();
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});

export type Db = Client;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
