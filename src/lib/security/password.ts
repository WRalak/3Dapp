import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations, 1 lane).
 * Algorithm 2 === Argon2id in @node-rs/argon2.
 */
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Precomputed hash used to equalise timing when the account does not exist. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword("timing-equaliser-password");
  await verifyPassword(await dummy, password);
}
