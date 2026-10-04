#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
cd "${APP_DIR}"

if [[ ! -f .env || ! -f docker-compose.yml ]]; then
  echo "No MWX-ISP Compose installation found in ${APP_DIR}." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' .env; then
  echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2
  exit 1
fi

docker compose config --quiet
old_image_id="$(docker compose images -q app | head -n 1 || true)"
docker compose pull app

if ! docker compose up -d --no-deps app; then
  echo "Update failed; rolling back to the previous image." >&2
  if [[ -n "${old_image_id}" ]]; then
    docker image tag "${old_image_id}" ghcr.io/bjo163/mwx-isp:rollback
    MWX_ISP_VERSION=rollback docker compose up -d --no-deps app
  fi
  exit 1
fi

container_id="$(docker compose ps -q app)"
for attempt in $(seq 1 30); do
  state="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
  if [[ "${state}" == healthy || "${state}" == running ]]; then
    echo "MWX-ISP update completed successfully."
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "Updated container did not become healthy; restoring the previous image." >&2
if [[ -n "${old_image_id}" ]]; then
  docker image tag "${old_image_id}" ghcr.io/bjo163/mwx-isp:rollback
  MWX_ISP_VERSION=rollback docker compose up -d --no-deps app
fi
docker compose logs --tail=100 app >&2
exit 1
