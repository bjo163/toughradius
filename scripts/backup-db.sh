#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
BACKUP_ROOT="${MWX_ISP_BACKUP_DIR:-/var/backups/mwx-isp}"
RETENTION_DAYS="${MWX_ISP_BACKUP_RETENTION_DAYS:-30}"
QUIET=false
if [[ "${1:-}" == "--quiet" ]]; then QUIET=true; elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--quiet]" >&2; exit 2
fi

[[ "${EUID}" -eq 0 ]] || { echo "Run backup as root so the backup directory stays private." >&2; exit 1; }
[[ -f "${APP_DIR}/.env" && -f "${APP_DIR}/docker-compose.yml" ]] || { echo "No MWX-ISP Compose installation found in ${APP_DIR}." >&2; exit 1; }
[[ "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]] || { echo "MWX_ISP_BACKUP_RETENTION_DAYS must be a positive integer." >&2; exit 1; }
exec 8>/run/lock/mwx-isp-backup.lock
if ! flock -n 8; then echo "Another MWX-ISP backup is already running." >&2; exit 1; fi

umask 077
mkdir -p "${BACKUP_ROOT}"
chmod 0700 "${BACKUP_ROOT}"
stamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
temporary="${BACKUP_ROOT}/.incomplete-${stamp}-$$"
destination="${BACKUP_ROOT}/${stamp}"
mkdir -m 0700 "${temporary}"
cleanup() { [[ ! -d "${temporary}" ]] || rm -rf -- "${temporary}"; }
trap cleanup EXIT

cd "${APP_DIR}"
docker compose exec -T db sh -ec 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "${temporary}/database.dump"
docker compose exec -T app tar -C /var/toughradius -czf - . > "${temporary}/application-data.tar.gz"
container_id="$(docker compose ps -q app | head -n 1)"
[[ -n "${container_id}" ]] || { echo "The MWX-ISP app container must be running to create a complete backup." >&2; exit 1; }
app_image_id="$(docker inspect --format='{{.Image}}' "${container_id}")"
docker image tag "${app_image_id}" "mwx-isp:backup-${stamp}"
app_version="$(docker image inspect --format='{{ index .Config.Labels "org.opencontainers.image.version" }}' "${app_image_id}" 2>/dev/null || true)"
app_image_ref=""
if [[ -n "${app_version}" && "${app_version}" != "<no value>" ]]; then app_image_ref="ghcr.io/bjo163/mwx-isp:${app_version}"; fi
{
  printf 'format=1\ncreated_utc=%s\n' "${stamp}"
  printf 'source_revision=%s\n' "$(git -C "${APP_DIR}" rev-parse HEAD 2>/dev/null || printf unknown)"
  printf 'app_image_id=%s\napp_image_tag=mwx-isp:backup-%s\napp_image_ref=%s\n' "${app_image_id}" "${stamp}" "${app_image_ref}"
} > "${temporary}/metadata.txt"
(cd "${temporary}" && sha256sum database.dump application-data.tar.gz metadata.txt > SHA256SUMS)
mv -- "${temporary}" "${destination}"
temporary=""
while IFS= read -r -d '' expired; do
  image_tag="$(awk -F= '$1 == "app_image_tag" { print $2 }' "${expired}/metadata.txt" 2>/dev/null || true)"
  [[ -z "${image_tag}" ]] || docker image rm "${image_tag}" >/dev/null 2>&1 || true
  rm -rf -- "${expired}"
done < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '????????T???????????????Z' -mtime "+${RETENTION_DAYS}" -print0)
if [[ "${QUIET}" == true ]]; then printf '%s\n' "${destination}"; else echo "Backup completed: ${destination}"; fi
