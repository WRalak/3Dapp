# Deployment

## Checklist

1. **Secrets:** generate `AUTH_SECRET`, `ENCRYPTION_KEY` and `MPESA_CALLBACK_SECRET` with `openssl rand -base64 48`. Store them in your platform's secret manager, never in git.
2. **Production settings:**
   - `NODE_ENV=production`, `APP_URL=https://your-domain`, `ADMIN_MFA_REQUIRED=true`.
   - `PAYMENT_SANDBOX_ENABLED` must be unset or false; the app refuses to boot otherwise.
   - Do not set `RATE_LIMIT_MULTIPLIER`.
3. **Database:**
   - Create the least-privilege roles (`scripts/db-roles.sql`).
   - Run migrations as `atelier_migrator` and point the app's `DATABASE_URL` at `atelier_app`.
   - Behind PgBouncer, keep `DATABASE_POOL_MAX` small (5–10) per instance.
4. **Redis:** set `REDIS_URL` so rate limits and caches are shared across instances. Without it, limits apply per process only.
5. **Storage:**
   - Set `STORAGE_DRIVER=s3` with an R2/S3 bucket (`S3_*`). Serve files through `S3_PUBLIC_URL` or `CDN_URL` with long-lived caching.
   - Configure bucket CORS to allow `PUT` from your domain with the `content-type` header.
6. **Email:** set `SMTP_URL` and `EMAIL_FROM`. In production, a missing SMTP configuration fails jobs (and retries them) rather than logging tokens.
7. **Payments:** register these webhook endpoints and set the matching secrets:
   - Stripe → `https://your-domain/api/webhooks/card` (events `checkout.session.*`).
   - PayPal → `https://your-domain/api/webhooks/paypal` (events `PAYMENT.CAPTURE.*`); set `PAYPAL_WEBHOOK_ID`.
   - M-Pesa: callback URLs are generated per payment. Set `MPESA_*`, plus `MPESA_KES_RATE` when the store currency isn't KES.
8. **Jobs:** run at least one `worker` replica, or schedule `GET /api/cron/jobs` every minute with `Authorization: Bearer $CRON_SECRET`.
9. **Monitoring:** set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. Point your load balancer at `GET /api/health`, which returns 503 when the database is down. Ship stdout JSON logs to your log platform.
10. **Assets:** add `public/fonts/Satoshi-Variable.woff2`. Put a CDN in front of `/_next/static`, `/vendor` and the asset bucket.
11. **First admin:** run the seed once, or create a user and grant `SUPER_ADMIN`. Then change the password and enrol MFA, and invite the other staff from **Admin → Staff**.

## Docker / Compose

```bash
cp .env.example .env
```

Edit `.env` and fill in the secrets, then start the stack:

```bash
docker compose up -d db redis
```

```bash
docker compose run --rm migrate
```

```bash
docker compose up -d web worker
```

To load demo data (optional):

```bash
docker compose run --rm --entrypoint "npm run db:seed" migrate
```

The image has two targets:
- `web`: the minimal Next.js standalone server, running as a non-root user with a health check.
- `tools`: the full toolchain for `prisma migrate deploy`, seeding and `npm run worker`.

The build needs no secrets, because database and environment access are lazy.

## Vercel

- Build command: `npm run build`. Run `npx prisma migrate deploy` in a release step or CI job before promoting.
- Use the S3/R2 storage driver; the serverless filesystem is ephemeral.
- Schedule a Vercel Cron for `/api/cron/jobs` (every minute) and set `CRON_SECRET`.
- Use a pooled Postgres URL (Neon/Supabase pooler, or PgBouncer).

## Migrations

- Create migrations locally with `npm run db:migrate` and commit the generated SQL.
- Hand-written SQL (triggers, CHECK constraints, partial indexes, the FTS function) lives in the init migration. Keep such statements in migrations, never in ad-hoc scripts.
- Deploy with `npm run db:deploy`. This is non-destructive and applies only pending migrations.

## Backups and recovery

- **Logical backups:** `scripts/backup.sh` writes `pg_dump` custom-format archives with a SHA-256 checksum and verifies that each one is readable. Run it daily and copy the files to versioned, off-site object storage (e.g. an R2/S3 bucket with object lock). `RETENTION_DAYS` controls local pruning.
- **Point-in-time recovery:** on managed Postgres, enable PITR/WAL archiving (RDS, Cloud SQL, Neon and Supabase all support it). Target RPO ≤ 5 minutes, RTO ≤ 1 hour.
- **Restore drill:** create an empty database, then:

  ```bash
  DATABASE_URL=… ./scripts/restore.sh backups/atelier-<stamp>.dump
  ```

  Then run `npx prisma migrate deploy` and check that `/api/health` responds and that order counts match. This drill was exercised during development (see the progress report). Repeat it quarterly.
- **Object storage:** enable bucket versioning for product images and 3D models. Assets are referenced by immutable keys.
- **Redis** holds only caches and rate-limit counters. It needs no backup, and losing it is safe.
