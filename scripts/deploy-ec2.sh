#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-$HOME/pineflow}"
APP_IMAGE_TAG="${APP_IMAGE_TAG:-latest}"

cd "$APP_DIR"

if [ ! -f ".env.production" ]; then
  echo ".env.production is missing in $APP_DIR" >&2
  exit 1
fi

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
fi

git fetch origin main
git reset --hard origin/main

export APP_IMAGE_TAG

docker compose -p pineflow -f compose.deploy.yml up -d postgres
docker compose -p pineflow -f compose.deploy.yml pull app
docker compose -p pineflow -f compose.deploy.yml up -d --no-deps app

docker image prune -f
curl -fsS http://127.0.0.1/api/health
