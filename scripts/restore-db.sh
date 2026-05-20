#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore-db.sh backups/<backup-file>.dump" >&2
  exit 1
fi

PROJECT_NAME="${PROJECT_NAME:-pineflow}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.deploy.yml}"
BACKUP_FILE="$(basename "$1")"

if [ ! -f "backups/$BACKUP_FILE" ]; then
  echo "Backup file not found: backups/$BACKUP_FILE" >&2
  exit 1
fi

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec postgres \
  sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists \"/backups/$BACKUP_FILE\""

echo "Restore completed from backups/$BACKUP_FILE"
