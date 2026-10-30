import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at boot. Never import this from client components.
 * Every variable is documented in `.env.example`.
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().optional(),

  // 32+ byte secrets (base64 or hex). Used for HMAC signing and field encryption.
  AUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  ADMIN_MFA_REQUIRED: bool.default(true),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  STORE_CURRENCY: z.string().length(3).default("USD"),
  TAX_RATE_BPS: z.coerce.number().int().min(0).max(10000).default(1600),
  TAX_INCLUSIVE: bool.default(false),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  CDN_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),

  EMAIL_FROM: z.string().default("Atelier <no-reply@atelier.local>"),
  SMTP_URL: z.string().optional(),

  // Payments
  PAYMENT_SANDBOX_ENABLED: bool.default(false),
  SANDBOX_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_CALLBACK_SECRET: z.string().optional(),
  MPESA_KES_RATE: z.coerce.number().positive().optional(),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.PAYMENT_SANDBOX_ENABLED) {
    throw new Error("PAYMENT_SANDBOX_ENABLED must not be enabled in production");
  }
  return parsed.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= load();
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
