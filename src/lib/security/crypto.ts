import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token with the given number of bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string | Buffer, value: string | Buffer, encoding: "hex" | "base64" | "base64url" = "hex"): string {
  return createHmac("sha256", secret).update(value).digest(encoding);
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encryption for secrets at rest (e.g. TOTP seeds). Output: iv.tag.ciphertext (base64url). */
export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string, secret: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !ct) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Signs a compact payload with an expiry: base64url(json).sig */
export function signPayload(data: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmacSha256(secret, body, "base64url")}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string, secret: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSha256(secret, body, "base64url"))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}
