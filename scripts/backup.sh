#!/usr/bin/env bash
# Logical backup of the Atelier database to compressed, timestamped files.
# Usage: DATABASE_URL=... BACKUP_DIR=/backups ./scripts/backup.sh
# Schedule daily (cron/systemd timer) and ship to off-site object storage with versioning.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/atelier-$STAMP.dump"
# Strip Prisma's ?schema= parameter, which libpq does not understand.
PG_URL="${DATABASE_URL%%\?*}"
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$PG_URL"
pg_restore --list "$FILE" > /dev/null   # verify the archive is readable
sha256sum "$FILE" > "$FILE.sha256"
find "$BACKUP_DIR" -name 'atelier-*.dump*' -mtime "+$RETENTION_DAYS" -delete
echo "Backup written: $FILE"
