import "server-only";
import Redis from "ioredis";
import { logger } from "@/lib/logger";

/**
 * Lazily connected Redis client. When REDIS_URL is unset or Redis is unreachable the
 * helpers degrade gracefully (cache misses, in-memory rate limiting) instead of failing requests.
 */
let client: Redis | null | undefined;
let warned = false;

export function redis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }
  client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  client.on("error", (err) => {
    if (!warned) {
      logger.warn({ err: err.message }, "redis unavailable; falling back to in-process behaviour");
      warned = true;
    }
  });
  client.on("ready", () => {
    warned = false;
  });
  return client;
}

function ready(r: Redis | null): r is Redis {
  return !!r && r.status === "ready";
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const r = redis();
    if (!ready(r)) return null;
    try {
      const raw = await r.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number) {
    const r = redis();
    if (!ready(r)) return;
    try {
      await r.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      /* cache writes are best effort */
    }
  },

  async del(...keys: string[]) {
    const r = redis();
    if (!ready(r) || keys.length === 0) return;
    try {
      await r.del(...keys);
    } catch {
      /* best effort */
    }
  },

  /** Deletes all keys with the given prefix using SCAN (never KEYS). */
  async delPrefix(prefix: string) {
    const r = redis();
    if (!ready(r)) return;
    try {
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
        cursor = next;
        if (keys.length) await r.del(...keys);
      } while (cursor !== "0");
    } catch {
      /* best effort */
    }
  },

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const hit = await cache.get<T>(key);
    if (hit !== null) return hit;
    const value = await loader();
    await cache.set(key, value, ttlSeconds);
    return value;
  },
};

export const CacheKeys = {
  catalogPrefix: "catalog:",
  product: (slug: string) => `catalog:product:${slug}`,
  listing: (hash: string) => `catalog:list:${hash}`,
  facets: "catalog:facets",
  home: "catalog:home",
  showroom: "catalog:showroom",
  dashboard: "admin:dashboard",
};
