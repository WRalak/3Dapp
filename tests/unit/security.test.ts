import { describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, safeEqual, sha256, signPayload, verifyPayload } from "@/lib/security/crypto";
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from "@/lib/security/totp";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { signTimestampedPayload, verifyTimestampedSignature } from "@/features/payments/signatures";
import { safeRedirect } from "@/lib/utils";
import { passwordSchema } from "@/lib/validation/auth";

const SECRET = "a-very-long-secret-used-only-in-unit-tests";

describe("signed payloads", () => {
  it("round-trips and rejects tampering", () => {
    const token = signPayload({ key: "images/a.png" }, SECRET, 60);
    expect(verifyPayload(token, SECRET)).toMatchObject({ key: "images/a.png" });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ key: "../../etc/passwd", exp: 9e9 })).toString("base64url");
    expect(verifyPayload(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyPayload(`${body}.${sig}x`, SECRET)).toBeNull();
    expect(verifyPayload(token, `${SECRET}-other`)).toBeNull();
  });
  it("expires", () => {
    vi.useFakeTimers();
    const token = signPayload({ a: 1 }, SECRET, 10);
    vi.advanceTimersByTime(11_000);
    expect(verifyPayload(token, SECRET)).toBeNull();
    vi.useRealTimers();
  });
});

describe("encryption at rest", () => {
  it("encrypts with a random IV and authenticates", () => {
    const a = encrypt("JBSWY3DPEHPK3PXP", SECRET);
    const b = encrypt("JBSWY3DPEHPK3PXP", SECRET);
    expect(a).not.toEqual(b);
    expect(decrypt(a, SECRET)).toBe("JBSWY3DPEHPK3PXP");
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), SECRET)).toThrow();
  });
});

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test vector", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totp(secret, 59_000)).toBe("287082");
    expect(hotp(secret, 0)).toBe("755224");
  });
  it("tolerates ±1 step of clock drift only", () => {
    const at = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, at - 30_000), at)).toBe(true);
    expect(verifyTotp(secret, totp(secret, at - 90_000), at)).toBe(false);
    expect(verifyTotp(secret, "abc123", at)).toBe(false);
  });
  it("base32 round-trips", () => expect(base32Decode(base32Encode(Buffer.from("hello"))).toString()).toBe("hello"));
});

describe("Argon2id passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Correct-Horse-9")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
  it("enforces a strong password policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("NoNumbersHere").success).toBe(false);
    expect(passwordSchema.safeParse("Correct-Horse-9").success).toBe(true);
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1" });
  it("accepts a fresh, valid signature", () => {
    expect(verifyTimestampedSignature(SECRET, body, signTimestampedPayload(SECRET, body))).toBe(true);
  });
  it("rejects modified bodies, wrong secrets, missing headers and replays", () => {
    const header = signTimestampedPayload(SECRET, body);
    expect(verifyTimestampedSignature(SECRET, body + " ", header)).toBe(false);
    expect(verifyTimestampedSignature("other-secret", body, header)).toBe(false);
    expect(verifyTimestampedSignature(SECRET, body, null)).toBe(false);
    const old = signTimestampedPayload(SECRET, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifyTimestampedSignature(SECRET, body, old)).toBe(false);
  });
});

describe("misc security helpers", () => {
  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("hashes tokens deterministically", () => expect(sha256("x")).toHaveLength(64));
  it("prevents open redirects", () => {
    expect(safeRedirect("/account")).toBe("/account");
    expect(safeRedirect("https://evil.example")).toBe("/");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("/\\evil.example")).toBe("/");
    expect(safeRedirect(undefined, "/x")).toBe("/x");
  });
});
