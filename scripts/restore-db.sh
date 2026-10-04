#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
if [[ "${EUID}" -ne 0 ]]; then echo "Run restore as root." >&2; exit 1; fi
exec 9>/run/lock/mwx-isp-update.lock
if ! flock -n 9; then echo "An MWX-ISP update or restore is already running." >&2; exit 1; fi
if [[ $# -ne 1 ]]; then echo "Usage: $0 <backup-directory>" >&2; exit 2; fi
backup_dir="$(realpath -e -- "$1")"
[[ -f "${backup_dir}/database.dump" && -f "${backup_dir}/application-data.tar.gz" && -f "${backup_dir}/SHA256SUMS" ]] || { echo "Backup set is incomplete: ${backup_dir}" >&2; exit 1; }
cd "${APP_DIR}"
[[ -f .env && -f docker-compose.yml ]] || { echo "No MWX-ISP Compose installation found in ${APP_DIR}." >&2; exit 1; }
(cd "${backup_dir}" && sha256sum --check --status SHA256SUMS) || { echo "Backup checksum validation failed; refusing restore." >&2; exit 1; }
app_image_tag="$(awk -F= '$1 == "app_image_tag" { print $2 }' "${backup_dir}/metadata.txt" 2>/dev/null || true)"
[[ -n "${app_image_tag}" ]] || { echo "Backup does not identify the matching application image." >&2; exit 1; }
[[ "${app_image_tag}" =~ ^mwx-isp:backup-[0-9]{8}T[0-9]{15}Z$ ]] || { echo "Backup metadata contains an invalid app image tag." >&2; exit 1; }
app_image_id="$(awk -F= '$1 == "app_image_id" { print $2 }' "${backup_dir}/metadata.txt" 2>/dev/null || true)"
[[ -n "${app_image_id}" ]] || { echo "Backup does not identify the matching application image ID." >&2; exit 1; }
[[ "${app_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Backup metadata contains an invalid app image ID." >&2; exit 1; }
app_image_ref="$(awk -F= '$1 == "app_image_ref" { print $2 }' "${backup_dir}/metadata.txt" 2>/dev/null || true)"
if ! docker image inspect "${app_image_id}" >/dev/null 2>&1; then
  [[ -n "${app_image_ref}" ]] || { echo "The matching app image is not local and this backup has no release tag to retrieve it." >&2; exit 1; }
  [[ "${app_image_ref}" =~ ^ghcr\.io/bjo163/mwx-isp:[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || { echo "Backup metadata contains an invalid release image reference." >&2; exit 1; }
  docker pull "${app_image_ref}"
  app_image_id="$(docker image inspect --format='{{.Id}}' "${app_image_ref}")"
fi
docker image tag "${app_image_id}" "${app_image_tag}"

cat <<EOF
This will replace the live MWX-ISP database and application files with:
  ${backup_dir}
The current state will first be saved to a new safety backup.
EOF
if [[ "${MWX_ISP_RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  read -r -p 'Type RESTORE to continue: ' confirmation
  [[ "${confirmation}" == "RESTORE" ]] || { echo "Restore cancelled."; exit 1; }
fi

safety_backup="$(MWX_ISP_DIR="${APP_DIR}" /usr/bin/env bash "${APP_DIR}/scripts/backup-db.sh" --quiet)"
echo "Safety backup created: ${safety_backup}"
docker compose stop app
docker compose exec -T db sh -ec 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "${backup_dir}/database.dump"
# The one-shot helper overrides the entrypoint and runs as root so tar can restore
# owner and mode metadata exactly into the named volume.
MWX_ISP_IMAGE="${app_image_tag}" docker compose run --rm -T --no-deps --pull never --user 0:0 --entrypoint /bin/sh app -ec 'find /var/toughradius -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /var/toughradius -xzf -; chown -R 10001:10001 /var/toughradius' < "${backup_dir}/application-data.tar.gz"
MWX_ISP_IMAGE="${app_image_tag}" docker compose up -d --pull never --no-deps app
container_id="$(MWX_ISP_IMAGE="${app_image_tag}" docker compose ps -q app)"
for attempt in $(seq 1 60); do
  state="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
  [[ "${state}" == healthy ]] && break
  if [[ "${state}" == unhealthy || "${state}" == exited || -z "${state}" ]]; then echo "Restored app failed health checks. Safety backup: ${safety_backup}" >&2; docker compose logs --tail=100 app >&2; exit 1; fi
  sleep 2
done
[[ "${state}" == healthy ]] || { echo "Restored app did not become healthy within 120 seconds. Safety backup: ${safety_backup}" >&2; exit 1; }
echo "Restore applied. Check service health and logs before returning traffic. Safety backup: ${safety_backup}"
docker compose ps
