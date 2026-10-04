#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
cd "${APP_DIR}"
if [[ "${MWX_ISP_DEPLOY_LOCK_HELD:-false}" != true ]]; then
  exec 9>/run/lock/mwx-isp-update.lock
  if ! flock -n 9; then echo "Another MWX-ISP install, update, or restore is already running."; exit 0; fi
fi
[[ -f .env && -f docker-compose.yml && -d .git ]] || { echo "No MWX-ISP Compose installation found in ${APP_DIR}." >&2; exit 1; }
if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' .env; then echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2; exit 1; fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing update: ${APP_DIR} contains local changes. Commit or back them up before updating." >&2; exit 1
fi
remote_url="$(git remote get-url origin)"
case "${remote_url}" in
  https://github.com/bjo163/mwx-isp.git|git@github.com:bjo163/mwx-isp.git) ;;
  *) echo "Unexpected origin remote (${remote_url}); refusing to update the wrong project." >&2; exit 1 ;;
esac

old_revision="$(git rev-parse HEAD)"
git fetch --quiet --force origin main
new_revision="$(git rev-parse origin/main)"
configured_image_for() {
  docker compose config --format json | awk -v service="$1" '
    /"services"[[:space:]]*:/ { in_services=1; depth=1; next }
    in_services && depth == 1 && $0 ~ "\"" service "\"[[:space:]]*:[[:space:]]*\\{" { target=1 }
    in_services && target && depth == 2 && /"image"[[:space:]]*:/ {
      sub(/^.*"image"[[:space:]]*:[[:space:]]*"/, "")
      sub(/".*$/, "")
      print
      exit
    }
    in_services {
      opened=gsub(/\{/, "{")
      closed=gsub(/\}/, "}")
      depth += opened - closed
      if (target && depth < 2) target=0
    }
  '
}
if [[ "${old_revision}" == "${new_revision}" ]]; then
  # The registry may have completed publishing after a previous failed update.
  if ! docker compose pull app; then echo "Could not check the published MWX-ISP image." >&2; exit 1; fi
  if ! docker compose pull db; then echo "Could not check the PostgreSQL patch image." >&2; exit 1; fi
  current_id="$(docker compose ps -q app | head -n 1 | xargs -r docker inspect --format='{{.Image}}' 2>/dev/null || true)"
  configured_image="$(configured_image_for app)"
  pulled_id="$(docker image inspect "${configured_image}" --format='{{.Id}}' 2>/dev/null || true)"
  current_db_id="$(docker compose ps -q db | head -n 1 | xargs -r docker inspect --format='{{.Image}}' 2>/dev/null || true)"
  configured_db_image="$(configured_image_for db)"
  pulled_db_id="$(docker image inspect "${configured_db_image}" --format='{{.Id}}' 2>/dev/null || true)"
  if [[ -n "${current_id}" && "${current_id}" == "${pulled_id}" && -n "${current_db_id}" && "${current_db_id}" == "${pulled_db_id}" ]]; then echo "MWX-ISP and PostgreSQL are already up to date (${old_revision:0:12})."; exit 0; fi
fi

old_container="$(docker compose ps -q app | head -n 1 || true)"
old_image_id=""
if [[ -n "${old_container}" ]]; then
  old_image_id="$(docker inspect --format='{{.Image}}' "${old_container}" 2>/dev/null || true)"
fi
if [[ -z "${old_image_id}" ]]; then
  echo "Cannot identify the running image; refusing an update without a rollback target." >&2; exit 1
fi
old_db_container="$(docker compose ps -q db | head -n 1 || true)"
old_db_image_id=""
if [[ -n "${old_db_container}" ]]; then old_db_image_id="$(docker inspect --format='{{.Image}}' "${old_db_container}" 2>/dev/null || true)"; fi
if [[ -z "${old_db_image_id}" ]]; then echo "Cannot identify the running PostgreSQL image; refusing an update without a database rollback target." >&2; exit 1; fi
docker image tag "${old_image_id}" mwx-isp:rollback
docker image tag "${old_db_image_id}" mwx-isp-postgres:rollback
if [[ -f "${APP_DIR}/scripts/backup-db.sh" ]]; then
  backup_path="$(/usr/bin/env bash "${APP_DIR}/scripts/backup-db.sh" --quiet)"
else
  # Bootstrap a pre-update snapshot for installations created before backup tooling shipped.
  backup_path="$(git show origin/main:scripts/backup-db.sh | MWX_ISP_DIR="${APP_DIR}" bash -- --quiet)"
fi
echo "Pre-update backup created: ${backup_path}"

rollback() {
  local message="$1"
  echo "${message}" >&2
  git reset --hard "${old_revision}" >&2 || true
  if MWX_ISP_POSTGRES_IMAGE=mwx-isp-postgres:rollback docker compose up -d --pull never --no-build --no-deps db >&2; then
    wait_for_db >&2 || true
  fi
  MWX_ISP_IMAGE=mwx-isp:rollback docker compose up -d --pull never --no-build --no-deps app >&2 || true
  echo "Database schema changes are not automatically reversed. If the old app is incompatible, restore backup explicitly: /usr/bin/env bash ${APP_DIR}/scripts/restore-db.sh '${backup_path}'" >&2
  docker compose logs --tail=100 app >&2 || true
  return 1
}

wait_for_db() {
  local db_container_id db_state attempt
  db_container_id="$(docker compose ps -q db)"
  [[ -n "${db_container_id}" ]] || return 1
  for attempt in $(seq 1 60); do
    db_state="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${db_container_id}" 2>/dev/null || true)"
    [[ "${db_state}" == healthy ]] && return 0
    [[ "${db_state}" == unhealthy || "${db_state}" == exited || -z "${db_state}" ]] && return 1
    sleep 2
  done
  return 1
}

if [[ -x "${APP_DIR}/scripts/backup-db.sh" ]]; then
  echo "--> Creating pre-update database backup..."
  "${APP_DIR}/scripts/backup-db.sh" || echo "Warning: Pre-update database backup failed, continuing update with caution..." >&2
fi

git reset --hard "${new_revision}"
if ! docker compose config --quiet || ! docker compose pull db app; then rollback "Compose validation or image pull failed; reverting source, PostgreSQL, and app images."; exit 1; fi
if ! docker compose stop app; then rollback "Could not stop the app before the PostgreSQL patch update; reverting source and both images."; exit 1; fi
if ! docker compose up -d --pull never --no-build --no-deps db; then rollback "PostgreSQL patch update failed to start; reverting source and both images."; exit 1; fi
wait_for_db || { rollback "PostgreSQL failed to become healthy within 120 seconds; reverting source, PostgreSQL, and app images."; exit 1; }
if ! docker compose run --rm -T --no-deps --pull never --user 0:0 --entrypoint /bin/sh app -ec 'if [ "$(stat -c "%u" /var/toughradius)" != "10001" ]; then chown -R 10001:10001 /var/toughradius; fi'; then
  rollback "Application data-volume ownership migration failed; reverting source and both images."; exit 1
fi
if ! docker compose up -d --pull never --no-build --no-deps app; then rollback "Application container failed to start; reverting source and app image."; exit 1; fi

container_id="$(docker compose ps -q app)"
for attempt in $(seq 1 60); do
  state="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
  if [[ "${state}" == healthy ]]; then echo "MWX-ISP update completed successfully."; docker compose ps; exit 0; fi
  if [[ "${state}" == unhealthy || "${state}" == exited || -z "${state}" ]]; then rollback "Updated container failed health checks; reverting source and app image."; exit 1; fi
  sleep 2
done
rollback "Updated container did not become healthy within 120 seconds; reverting source and app image."
