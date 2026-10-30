#!/usr/bin/env bash
# Restore a backup produced by backup.sh into an EMPTY database.
# Usage: DATABASE_URL=... ./scripts/restore.sh backups/atelier-YYYYMMDDTHHMMSSZ.dump
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
FILE="${1:?path to .dump file}"
sha256sum -c "$FILE.sha256"
PG_URL="${DATABASE_URL%%\?*}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$PG_URL" "$FILE"
echo "Restored $FILE. Run 'npx prisma migrate deploy' to apply any newer migrations."
