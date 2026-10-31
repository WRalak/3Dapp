# 3Dapp: Kenyan 3D fashion marketplace

3Dapp is a multi-vendor fashion marketplace for Kenya. Independent designers, tailors and boutiques sell through one storefront; shoppers browse a **3D clothing rail** (or a light 2D shop on slow connections), pay once with **M-Pesa**, card or PayPal, and each designer delivers their own pieces. The same Next.js app includes a **seller portal** and a permission-based **admin** for seller verification, listing moderation, finance and payouts.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Radix · Framer Motion |
| **3D** | React Three Fiber · Three.js · GLB/glTF with Draco, KTX2 and Meshopt · 2D fallback · Lite mode |
| **Data** | PostgreSQL · Prisma 7 · Redis (cache and rate limits) · Postgres job queue |
| **Kenya** | KES (`KSh 1,500`) · English + Kiswahili · Africa/Nairobi · 47 counties · M-Pesa STK Push and Paybill (C2B) · B2C payout provider |
| **Marketplace** | Seller onboarding with private documents · listing approval · per-seller delivery zones · split orders · commission · append-only ledger · payouts · reconciliation |

## Quick start

Prerequisites: Node 22+ and PostgreSQL 14+ (Redis optional). The commands work in PowerShell, macOS and Linux.

No local PostgreSQL? Start one (plus Redis) with Docker Desktop:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Install dependencies (this also generates the Prisma client):

```bash
npm install
```

Create a development `.env` with random secrets, sandbox payments and optional staff MFA. It never overwrites an existing `.env`:

```bash
npm run setup
```

If your PostgreSQL isn't the Docker one, edit `DATABASE_URL` in `.env`. Then create the tables and demo data:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Optionally, in a second terminal, run the background worker (emails, SMS, reservation expiry, payment reconciliation, earnings release):

```bash
npm run worker
```

Open <http://localhost:3000>.

| Seeded account | Email | Password |
|---|---|---|
| Super admin | `admin@3dapp.test` | `3Dapp-Admin-2026` |
| Finance manager | `finance@3dapp.test` | `3Dapp-Admin-2026` |
| Content manager (approvals, reports) | `content@3dapp.test` | `3Dapp-Admin-2026` |
| Seller (Kitenge House, Nairobi) | `kitenge-house@sellers.3dapp.test` | `Seller-Demo-2026` |
| Other sellers | `pwani-threads@…`, `lakeside-atelier@…`, `rift-tailors@…`, `eldoret-leatherworks@…`, `thika-modest@…` (same domain) | `Seller-Demo-2026` |
| Pending applicant | `applicant@sellers.3dapp.test` | `Seller-Demo-2026` |
| Customer | `customer@3dapp.test` | `Customer-Demo-2026` |

The seed creates:

- all 47 counties;
- six Kenyan sellers (Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Thika) plus the house store, each with delivery zones;
- 27 KES products with stock and illustrative GLB silhouettes;
- six campaign collections and two promotions (one platform-funded, one seller-funded);
- coupons `KARIBU10`, `FREESHIP` and `SAVE500`;
- about 60 days of multi-seller orders settled through the real ledger.

Change every seeded password before any shared deployment.

**Font:** the design system uses **Satoshi** (ITF Free Font License). Place `Satoshi-Variable.woff2` in `public/fonts/`; until you do, a neutral sans-serif fallback is used.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run worker` | Background job worker |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Unit + integration tests (Vitest; integration tests use `TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright: desktop, mobile-touch and no-WebGL projects |
| `npm run db:deploy` / `db:seed` | Apply migrations, seed |

## Documentation

- [Marketplace design](docs/MARKETPLACE.md): sellers, split orders, ledger and payouts, M-Pesa, delivery, localisation, Lite mode, fabric accuracy
- [Architecture](docs/ARCHITECTURE.md): structure, data model, 3D pipeline, payments, caching and jobs
- [Security](docs/SECURITY.md): threat model and the controls in place
- [Deployment](docs/DEPLOYMENT.md): Docker, Vercel, environment, M-Pesa set-up, database roles, backups and recovery
- [Progress report](docs/PROGRESS.md): what was built, how it was verified, known limitations

All environment variables are documented in [`.env.example`](.env.example).
