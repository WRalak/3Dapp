/** Test environment — isolated database, sandbox payments, no external services. */
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://atelier:atelier@localhost:5432/atelier_test?schema=public";
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB,
  APP_URL: "http://localhost:3000",
  AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
  ENCRYPTION_KEY: "test-encryption-key-test-encryption-key-0123",
  ADMIN_MFA_REQUIRED: "true",
  PAYMENT_SANDBOX_ENABLED: "true",
  SANDBOX_WEBHOOK_SECRET: "sandbox-webhook-secret-for-tests-0123456789",
  STORE_CURRENCY: "KES",
  TAX_RATE_BPS: "1600",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./storage-test",
  LOG_LEVEL: "fatal",
});
delete process.env.REDIS_URL; // rate limiting falls back to in-memory
