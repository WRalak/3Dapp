#!/usr/bin/env node
/**
 * Creates a local development .env from .env.example (works on Windows, macOS and Linux):
 * fills the required secrets with random values and enables the dev-friendly switches
 * (sandbox payments, MFA optional). Never overwrites an existing .env.
 *
 *   npm run setup
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists — leaving it unchanged.");
  process.exit(0);
}
const secret = () => randomBytes(48).toString("base64url");
const values = {
  AUTH_SECRET: secret(),
  ENCRYPTION_KEY: secret(),
  SANDBOX_WEBHOOK_SECRET: secret(),
  MPESA_CALLBACK_SECRET: secret(),
  ADMIN_MFA_REQUIRED: "false",
  PAYMENT_SANDBOX_ENABLED: "true",
};
const out = readFileSync(".env.example", "utf8")
  .split(/\r?\n/)
  .map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    return key && key in values ? `${key}=${values[key]}` : line;
  })
  .join("\n");
writeFileSync(".env", out);
console.log("Created .env with random development secrets.");
console.log("Check DATABASE_URL points at your PostgreSQL (default: postgresql://atelier:atelier@localhost:5432/mtindo).");
