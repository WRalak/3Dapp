import { execSync } from "node:child_process";

/**
 * Applies pending migrations to the test database (non-destructive). Tests create uniquely
 * named fixtures, so the suite never needs to wipe data and is safe to re-run.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://atelier:atelier@localhost:5432/atelier_test?schema=public";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
