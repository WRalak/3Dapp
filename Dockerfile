# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# Atelier — multi-stage image
#   target "web"   : minimal Next.js standalone server (non-root)
#   target "tools" : full toolchain for migrations, seeding and the background worker
# ─────────────────────────────────────────────────────────────
ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS tools
WORKDIR /app
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
# The build reads no secrets: the DB client and env validation are lazy.
RUN npx next build
# Used for: prisma migrate deploy · db seed · npm run worker
CMD ["npm", "run", "worker"]

FROM node:${NODE_VERSION} AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 atelier && useradd --system --uid 1001 --gid atelier atelier \
  && mkdir -p /app/storage && chown atelier:atelier /app/storage
COPY --from=tools --chown=atelier:atelier /app/.next/standalone ./
COPY --from=tools --chown=atelier:atelier /app/.next/static ./.next/static
COPY --from=tools --chown=atelier:atelier /app/public ./public
USER atelier
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
