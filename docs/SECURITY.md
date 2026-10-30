# Security

| Area | Control | Where |
|---|---|---|
| Passwords | Argon2id (19 MiB, t=2); policy of 10+ chars, mixed case, and a digit or symbol; timing-equalised unknown-user path | `lib/security/password.ts`, `lib/validation/auth.ts` |
| Sessions | 256-bit opaque token in an `HttpOnly; Secure; SameSite=Lax` cookie (`__Host-` prefix in production). Only its SHA-256 hash is stored. Revocable per session, per user, on password change, on suspension | `lib/auth/session.ts` |
| Login protection | Rate limits per IP and per email; lockout after 5 failures for 15 minutes; every attempt recorded | `server/services/auth.service.ts` |
| Suspicious sign-in | New IP/device versus 90-day history → in-app notification, email and audit entry | `detectSuspiciousLogin` |
| Admin MFA | RFC 6238 TOTP. The secret is encrypted at rest (AES-256-GCM). Staff sessions are `mfaVerified=false` until challenged; enforced by `ADMIN_MFA_REQUIRED` | `lib/security/totp.ts`, `lib/auth/guards.ts` |
| Authorisation | Permission-based RBAC (roles = permission bundles, plus direct grants). Every admin page, Server Action and Route Handler calls `requirePermission`/`requireAdminPage` on the server. The UI only hides links. Super-admin escalation and last-super-admin removal are blocked | `lib/auth/*`, `features/admin/actions.ts` |
| OAuth | Google with `state` + PKCE in a signed, short-lived cookie. Accounts link only to provider-verified emails | `lib/auth/google.ts` |
| CSRF | Server Actions: Next.js Origin check. Cookie-authenticated Route Handlers: same-origin check in the `route()` wrapper. `SameSite=Lax` cookies | `lib/api.ts` |
| XSS | React escaping; a strict CSP with a per-request nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`. Invoices/emails/SVG HTML-escape every value; JSON-LD escapes `<` | `proxy.ts`, `features/orders/invoice.ts` |
| Injection | Prisma parameterised queries only; raw SQL uses tagged templates; Zod on every input; `LIKE` wildcards escaped; CSV formula-injection neutralised | `lib/validation/*`, `analytics.service.ts` |
| Open redirects | `safeRedirect` allows only same-site relative paths | `lib/utils.ts` |
| Uploads | Signed, expiring upload URLs that pin the key, type and size. Extension + MIME allow-list. After upload, **magic bytes** are re-checked for images and models are parsed as data (glTF inspector). External glTF URIs are rejected; SVG and executables are never accepted. Local paths are traversal-guarded | `features/uploads`, `features/showroom/gltf-inspect.ts`, `lib/storage` |
| Payments | Paid status comes only from verified provider signals; signature verification (HMAC with timestamp tolerance, PayPal API, signed M-Pesa callback + STK query); amount and currency checks; idempotent event store; idempotency keys sent to providers | `features/payments`, `payment.service.ts` |
| Integrity | DB triggers make audit log and order history append-only; CHECK constraints on stock, prices and ratings; a partial unique index enforces one default address | `prisma/migrations/*_init` |
| Audit | Every privileged mutation writes actor, action, entity, IP and user agent | `audit.service.ts`, `/admin/audit` |
| Headers | HSTS (preload), `nosniff`, `X-Frame-Options: DENY`, strict Referrer-Policy, Permissions-Policy, COOP | `next.config.ts` |
| Secrets | Validated env (`config/env.ts`), server-only imports (`server-only`), nothing secret under `NEXT_PUBLIC_*`. The sandbox payment provider refuses to start in production. Production never logs email bodies (they contain tokens) | `.env.example` |
| Database | Least-privilege app role without DDL (`scripts/db-roles.sql`) | `docs/DEPLOYMENT.md` |

## Reporting

Please report vulnerabilities privately to the security contact for your deployment. Do not open public issues.
