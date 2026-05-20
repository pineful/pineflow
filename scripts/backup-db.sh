#!/usr/bin/env sh
set -eu

PROJECT_NAME="${PROJECT_NAME:-pineflow}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.deploy.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

mkdir -p "$BACKUP_DIR"

docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f "/backups/pineflow-$(date +%Y%m%d-%H%M%S).dump"'

echo "Backup created in $BACKUP_DIR"
