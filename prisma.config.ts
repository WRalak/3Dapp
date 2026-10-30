import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --tsconfig tsconfig.worker.json prisma/seed.ts",
  },
  // Optional here so `prisma generate` (run by postinstall/predev) works before a .env exists.
  // Commands that touch the database (migrate, seed) still fail clearly without it.
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
