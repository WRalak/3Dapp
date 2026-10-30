import "server-only";
import { redis } from "@/lib/cache/redis";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetSeconds: number;
}

/** Fallback fixed-window counters when Redis is unavailable (per-instance only). */
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { success: true, remaining: limit - 1, resetSeconds: windowSeconds };
  }
  entry.count += 1;
  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Sliding-window rate limiter backed by a Redis sorted set.
 * `key` should identify the actor (ip, email, user id) and the action.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const r = redis();
  const fullKey = `rl:${key}`;
  if (!r || r.status !== "ready") return memoryLimit(fullKey, limit, windowSeconds);
  try {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    const results = await r
      .multi()
      .zremrangebyscore(fullKey, 0, windowStart)
      .zadd(fullKey, now, member)
      .zcard(fullKey)
      .pexpire(fullKey, windowSeconds * 1000)
      .exec();
    const count = Number(results?.[2]?.[1] ?? 0);
    return { success: count <= limit, remaining: Math.max(0, limit - count), resetSeconds: windowSeconds };
  } catch {
    return memoryLimit(fullKey, limit, windowSeconds);
  }
}

/** Named policies so limits are consistent across the codebase. */
export const RateLimits = {
  login: { limit: 10, window: 15 * 60 },
  loginEmail: { limit: 5, window: 15 * 60 },
  register: { limit: 5, window: 60 * 60 },
  passwordReset: { limit: 5, window: 60 * 60 },
  mfa: { limit: 6, window: 5 * 60 },
  checkout: { limit: 10, window: 60 },
  api: { limit: 120, window: 60 },
  newsletter: { limit: 5, window: 60 * 60 },
  review: { limit: 5, window: 60 * 60 },
  upload: { limit: 30, window: 60 * 60 },
  webhook: { limit: 300, window: 60 },
} as const;

export async function limitBy(policy: keyof typeof RateLimits, identifier: string) {
  const p = RateLimits[policy];
  return rateLimit(`${policy}:${identifier}`, p.limit, p.window);
}
