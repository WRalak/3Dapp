import { vi } from "vitest";

/**
 * In-memory replacement for next/headers so services that read cookies/headers can be
 * exercised outside a Next.js request. Each test can switch the "current browser".
 */
export const jar = new Map<string, string>();
export const requestHeaders = new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.10" });

export const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: (name: string, value: string) => void jar.set(name, value),
  delete: (name: string) => void jar.delete(name),
  has: (name: string) => jar.has(name),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => requestHeaders,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

export function resetBrowser(ip = "203.0.113.10") {
  jar.clear();
  requestHeaders.set("x-forwarded-for", ip);
}
