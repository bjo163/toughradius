#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
PURGE=false
REMOVE_BACKUPS=false
ASSUME_YES=false

# Recover from the previous release, which could delete the caller's cwd.
cd / || { echo "Cannot enter a safe working directory." >&2; exit 1; }

usage() {
  cat <<EOF
MWX-ISP VPS uninstaller

Usage: sudo bash scripts/vps-uninstall.sh [--yes] [--purge] [--remove-backups]

Remote one-command uninstall (safe mode):
  curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-uninstall.sh | sudo bash

Remote complete purge (permanent data deletion):
  curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-uninstall.sh | sudo bash -s -- --purge

  --yes              Skip the confirmation prompt.
  --purge            Permanently remove MWX-ISP PostgreSQL and app data volumes.
  --remove-backups   Also remove /var/backups/mwx-isp (requires --purge).
  --help             Show this help.

By default the stack, MWX-ISP systemd timers, and installation checkout are
removed, while database/app data volumes and backups are kept for a later reinstall.
Use MWX_ISP_DIR to select a non-default installation directory.
EOF
}

while (($#)); do
  case "$1" in
    --yes|-y) ASSUME_YES=true ;;
    --purge) PURGE=true ;;
    --remove-backups) REMOVE_BACKUPS=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[[ "${EUID}" -eq 0 ]] || { echo "Run as root: sudo bash scripts/vps-uninstall.sh" >&2; exit 1; }
[[ "${APP_DIR}" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "MWX_ISP_DIR must be a safe absolute path." >&2; exit 1; }
[[ "${REMOVE_BACKUPS}" != true || "${PURGE}" == true ]] || { echo "--remove-backups requires --purge." >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required to remove the MWX-ISP containers and volumes." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is required." >&2; exit 1; }
if [[ ! -d "${APP_DIR}" ]]; then
  case "${APP_DIR}" in /opt/mwx-isp|/srv/mwx-isp) ;;
    *) echo "Custom install path does not exist; refusing to search or purge Docker resources globally: ${APP_DIR}" >&2; exit 1 ;;
  esac
fi

if [[ -d "${APP_DIR}" ]]; then
  resolved_app_dir="$(realpath -e -- "${APP_DIR}")"
  [[ "${resolved_app_dir}" == "${APP_DIR}" && "${resolved_app_dir}" != / && "${resolved_app_dir}" != /opt ]] || {
    echo "Refusing unsafe install directory: ${resolved_app_dir}" >&2; exit 1;
  }
fi
if [[ "${PURGE}" != true && -f "${APP_DIR}/.env" && -e "${APP_DIR}.env.uninstalled" ]]; then
  echo "Config backup already exists at ${APP_DIR}.env.uninstalled; move it first to avoid overwriting it." >&2; exit 1
fi

if [[ "${ASSUME_YES}" != true ]]; then
  echo "This will stop and remove the MWX-ISP Docker stack and disable its update/backup timers."
  if [[ "${PURGE}" == true ]]; then
    echo "PURGE: PostgreSQL and app data volumes will be permanently deleted."
    [[ "${REMOVE_BACKUPS}" == true ]] && echo "PURGE: /var/backups/mwx-isp will also be permanently deleted."
  else
    echo "Database, app data, .env credentials, and backups will be kept."
  fi
  if [[ -r /dev/tty ]]; then
    read -r -p "Continue? Type 'uninstall' to confirm: " confirmation </dev/tty
  else
    echo "An interactive terminal is required for uninstall. Add --yes to confirm unattended operation." >&2; exit 1
  fi
  [[ "${confirmation}" == uninstall ]] || { echo "Cancelled."; exit 1; }
fi

exec 9>/run/lock/mwx-isp-update.lock
flock -n 9 || { echo "Another MWX-ISP install, update, or restore is running. Retry after it finishes." >&2; exit 1; }

for unit in mwx-isp-update.timer mwx-isp-backup.timer; do
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now "${unit}" >/dev/null 2>&1 || true
  fi
done

if [[ -f "${APP_DIR}/docker-compose.yml" ]]; then
  compose=(docker compose --project-name mwx-isp --project-directory "${APP_DIR}" -f "${APP_DIR}/docker-compose.yml")
  if [[ "${PURGE}" == true ]]; then
    "${compose[@]}" down --volumes --remove-orphans
  else
    "${compose[@]}" down --remove-orphans
  fi
else
  echo "Compose file not found under ${APP_DIR}; locating the MWX-ISP Docker project."
  mapfile -t projects < <(docker ps -aq --filter label=com.docker.compose.project | xargs -r docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' | sort -u)
  found_project=false
  for project in "${projects[@]}"; do
    case "${project}" in mwx-isp)
      found_project=true
      mapfile -t project_containers < <(docker ps -aq --filter "label=com.docker.compose.project=${project}")
      if ((${#project_containers[@]})); then docker rm -f "${project_containers[@]}"; fi
      if [[ "${PURGE}" == true ]]; then
        mapfile -t project_volumes < <(docker volume ls -q --filter "label=com.docker.compose.project=${project}")
        if ((${#project_volumes[@]})); then docker volume rm "${project_volumes[@]}"; fi
      fi
      ;;
    esac
  done
  if [[ "${PURGE}" == true ]]; then
    for volume in mwx-isp_postgres_data mwx-isp_mwx_isp_data mwx-isp_caddy_data mwx-isp_caddy_config; do
      if docker volume inspect "${volume}" >/dev/null 2>&1; then docker volume rm "${volume}"; fi
    done
  fi
  [[ "${found_project}" == true ]] || echo "No labeled MWX-ISP Compose containers were found."
fi

if [[ "${PURGE}" == true ]]; then
  if [[ "${REMOVE_BACKUPS}" == true && -d /var/backups/mwx-isp ]]; then
    resolved_backup_dir="$(realpath -e -- /var/backups/mwx-isp)"
    [[ "${resolved_backup_dir}" == /var/backups/mwx-isp ]] || { echo "Refusing unsafe backup path: ${resolved_backup_dir}" >&2; exit 1; }
    rm -rf --one-file-system -- /var/backups/mwx-isp
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now mwx-isp-update.service mwx-isp-backup.service >/dev/null 2>&1 || true
  rm -f -- /etc/systemd/system/mwx-isp-update.service /etc/systemd/system/mwx-isp-update.timer \
    /etc/systemd/system/mwx-isp-backup.service /etc/systemd/system/mwx-isp-backup.timer
  systemctl daemon-reload
  systemctl reset-failed mwx-isp-update.service mwx-isp-update.timer mwx-isp-backup.service mwx-isp-backup.timer >/dev/null 2>&1 || true
fi

if [[ -d "${APP_DIR}" ]]; then
  if [[ "${PURGE}" != true && -f "${APP_DIR}/.env" ]]; then
    # Keep the exact DB credentials needed by preserved volumes, outside the install path.
    config_backup="${APP_DIR}.env.uninstalled"
    install -m 0600 -o root -g root -- "${APP_DIR}/.env" "${config_backup}"
  fi
  # Keep the empty directory itself: the caller's interactive shell may be in it,
  # and deleting it leaves that shell with a broken cwd. The installer can clone
  # into an existing empty directory on reinstall.
  find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system -- {} +
  chmod 0750 "${APP_DIR}"
fi

if [[ "${PURGE}" == true ]]; then
  if [[ -e "${APP_DIR}.env.uninstalled" ]]; then rm -f -- "${APP_DIR}.env.uninstalled"; fi
  echo "MWX-ISP has been fully uninstalled and its data volumes removed. The empty install directory was kept for shell safety."
else
  echo "MWX-ISP services and installation files have been removed. Database and app data volumes were preserved. The empty install directory was kept for shell safety."
  if [[ -f "${APP_DIR}.env.uninstalled" ]]; then
    echo "Configuration backup (contains database credentials): ${APP_DIR}.env.uninstalled"
    echo "Restore it as ${APP_DIR}/.env before reinstalling, or keep it safe for a future restore."
  fi
  echo "Backups remain under /var/backups/mwx-isp."
fi
