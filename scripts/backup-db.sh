#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# MWX-ISP Automated Database Backup Script
# Creates a compressed PostgreSQL database dump with automatic retention pruning.
# ==============================================================================

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
if [[ -f "${APP_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

BACKUP_DIR="${APP_DIR}/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/mwx-isp-db-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
chmod 0700 "${BACKUP_DIR}"

DB_USER="${POSTGRES_USER:-mwxisp}"
DB_NAME="${POSTGRES_DB:-mwxisp}"

echo "==> Starting MWX-ISP database backup: ${TIMESTAMP}"

if command -v docker >/dev/null 2>&1 && docker compose -f "${APP_DIR}/docker-compose.yml" ps --services 2>/dev/null | grep -q '^db$'; then
  echo "--> Dumping database from Docker container 'db' (${DB_NAME})..."
  docker compose -f "${APP_DIR}/docker-compose.yml" exec -T db pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"
elif command -v pg_dump >/dev/null 2>&1; then
  echo "--> Dumping local PostgreSQL database (${DB_NAME})..."
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -U "${DB_USER}" -h "${POSTGRES_HOST:-127.0.0.1}" -p "${POSTGRES_PORT:-5432}" "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"
else
  echo "Error: Neither docker compose nor local pg_dump is available to perform backup." >&2
  exit 1
fi

chmod 0600 "${BACKUP_FILE}"
FILESIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "==> Backup created successfully: ${BACKUP_FILE} (${FILESIZE})"

# Prune old backups older than RETENTION_DAYS
echo "--> Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "mwx-isp-db-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -exec rm -f {} + || true

echo "==> Current available backups in ${BACKUP_DIR}:"
ls -lh "${BACKUP_DIR}"/mwx-isp-db-*.sql.gz 2>/dev/null || echo "(no backups found)"
