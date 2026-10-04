#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# MWX-ISP Automated Database Restore Script
# Restores a compressed or plain SQL database dump into the PostgreSQL container.
# Usage: ./scripts/restore-db.sh /path/to/mwx-isp-db-YYYYMMDD_HHMMSS.sql.gz
# ==============================================================================

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
if [[ -f "${APP_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>" >&2
  echo ""
  echo "Available backups in ${APP_DIR}/backups:"
  ls -lh "${APP_DIR}"/backups/mwx-isp-db-*.sql.gz 2>/dev/null || echo "(no backups found)"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: Backup file '${BACKUP_FILE}' does not exist." >&2
  exit 1
fi

DB_USER="${POSTGRES_USER:-mwxisp}"
DB_NAME="${POSTGRES_DB:-mwxisp}"

echo "================================================================================"
echo "WARNING: Restoring will overwrite all existing data in database '${DB_NAME}'!"
echo "Target backup: ${BACKUP_FILE}"
echo "================================================================================"
read -r -p "Are you sure you want to proceed? [y/N] " confirmation
if [[ "${confirmation}" != "y" && "${confirmation}" != "Y" ]]; then
  echo "Restore aborted by user."
  exit 0
fi

echo "--> Stopping MWX-ISP application container during restore..."
docker compose -f "${APP_DIR}/docker-compose.yml" stop app 2>/dev/null || true

echo "--> Restoring database from '${BACKUP_FILE}'..."
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gzip -dc "${BACKUP_FILE}" | docker compose -f "${APP_DIR}/docker-compose.yml" exec -T db psql -U "${DB_USER}" -d "${DB_NAME}"
else
  docker compose -f "${APP_DIR}/docker-compose.yml" exec -T db psql -U "${DB_USER}" -d "${DB_NAME}" < "${BACKUP_FILE}"
fi

echo "--> Restarting MWX-ISP application container..."
docker compose -f "${APP_DIR}/docker-compose.yml" start app

echo "==> Database restore completed successfully!"
docker compose -f "${APP_DIR}/docker-compose.yml" ps
