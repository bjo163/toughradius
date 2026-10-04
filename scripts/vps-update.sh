#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
cd "${APP_DIR}"

if [[ ! -f .env || ! -f docker-compose.yml || ! -d .git ]]; then
  echo "No MWX-ISP Compose installation found in ${APP_DIR}." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' .env; then
  echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2
  exit 1
fi

old_revision="$(git rev-parse HEAD)"
git fetch --quiet origin main
new_revision="$(git rev-parse origin/main)"
if [[ "${old_revision}" == "${new_revision}" ]]; then
  echo "MWX-ISP is already up to date (${old_revision:0:12})."
  exit 0
fi

old_image_id="$(docker compose images -q app | head -n 1 || true)"
if [[ -n "${old_image_id}" ]]; then
  docker image tag "${old_image_id}" mwx-isp:rollback
fi

if [[ -x "${APP_DIR}/scripts/backup-db.sh" ]]; then
  echo "--> Creating pre-update database backup..."
  "${APP_DIR}/scripts/backup-db.sh" || echo "Warning: Pre-update database backup failed, continuing update with caution..." >&2
fi

git reset --hard "${new_revision}"
if ! docker compose config --quiet || ! docker compose pull db; then
  echo "Compose validation or database image pull failed; restoring the previous source revision." >&2
  git reset --hard "${old_revision}"
  exit 1
fi

if ! docker compose build app; then
  echo "Build failed; restoring the previous source revision." >&2
  git reset --hard "${old_revision}"
  exit 1
fi

if ! docker compose up -d --no-deps app; then
  echo "Update failed; rolling back to the previous image." >&2
  git reset --hard "${old_revision}"
  if [[ -n "${old_image_id}" ]]; then
    MWX_ISP_IMAGE=mwx-isp:rollback docker compose up -d --no-build --no-deps app
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
git reset --hard "${old_revision}"
if [[ -n "${old_image_id}" ]]; then
  MWX_ISP_IMAGE=mwx-isp:rollback docker compose up -d --no-build --no-deps app
fi
docker compose logs --tail=100 app >&2
exit 1
