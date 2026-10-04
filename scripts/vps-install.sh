#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
if [[ "${EUID}" -ne 0 ]]; then echo "Run this installer as root: sudo bash scripts/vps-install.sh" >&2; exit 1; fi
if [[ ! "${APP_DIR}" =~ ^/[A-Za-z0-9_./-]+$ ]]; then
  echo "MWX_ISP_DIR must be an absolute path using only letters, numbers, dot, underscore, slash, and hyphen." >&2; exit 1
fi

for command in docker openssl git; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing ${command}. Install Docker Engine and the Docker Compose plugin first." >&2
    echo "Official guide: https://docs.docker.com/engine/install/" >&2; exit 1
  fi
done
command -v flock >/dev/null 2>&1 || { echo "flock is required to serialize automatic and manual updates." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is required (docker compose)." >&2; exit 1; }

mkdir -p "${APP_DIR}"
chmod 0750 "${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "${APP_DIR} exists and is not an MWX-ISP git checkout; move or back up its contents first." >&2; exit 1
  fi
  git clone --depth 1 --single-branch --branch main https://github.com/bjo163/mwx-isp.git "${APP_DIR}"
else
  remote_url="$(git -C "${APP_DIR}" remote get-url origin)"
  case "${remote_url}" in https://github.com/bjo163/mwx-isp.git|git@github.com:bjo163/mwx-isp.git) ;; *) echo "Unexpected origin remote (${remote_url}); refusing to install over another project." >&2; exit 1 ;; esac
  if [[ -n "$(git -C "${APP_DIR}" status --porcelain)" ]]; then echo "${APP_DIR} has local changes; installer will not overwrite them." >&2; exit 1; fi
  git -C "${APP_DIR}" fetch --quiet --force origin main
  if [[ -f "${APP_DIR}/.env" ]]; then
    cd "${APP_DIR}"
    docker compose config --quiet
    any_app_container="$(docker compose ps -a -q app | head -n 1 || true)"
    any_db_container="$(docker compose ps -a -q db | head -n 1 || true)"
    app_container="$(docker compose ps -q app | head -n 1 || true)"
    db_container="$(docker compose ps -q db | head -n 1 || true)"
    existing_data=""
    for volume in mwx-isp_postgres_data mwx-isp_mwx_isp_data; do
      if docker volume inspect "${volume}" >/dev/null 2>&1; then existing_data=1; fi
    done
    if [[ -n "${any_app_container}" || -n "${any_db_container}" || -n "${existing_data}" ]]; then
      if [[ -z "${app_container}" || -z "${db_container}" ]]; then
        echo "An existing MWX-ISP install has stopped or incomplete containers/data. Start both services before installing so a complete pre-upgrade backup can be made." >&2
        exit 1
      fi
      git -C "${APP_DIR}" show origin/main:scripts/backup-db.sh | MWX_ISP_DIR="${APP_DIR}" bash -- --quiet
    fi
  fi
  git -C "${APP_DIR}" reset --hard origin/main
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.vps.example" "${APP_DIR}/.env"
  admin_password="$(openssl rand -hex 20)"
  sed -i "s|CHANGE_ME_generate_a_long_random_secret|$(openssl rand -hex 32)|" "${APP_DIR}/.env"
  sed -i "s|CHANGE_ME_use_a_unique_password|${admin_password}|" "${APP_DIR}/.env"
  sed -i "s|CHANGE_ME_use_a_long_random_password|$(openssl rand -hex 32)|" "${APP_DIR}/.env"
  echo "MWX-ISP admin username: admin"
  echo "MWX-ISP admin password (store securely now): ${admin_password}"
fi
chmod 0600 "${APP_DIR}/.env"
if grep -q 'CHANGE_ME' "${APP_DIR}/.env"; then echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2; exit 1; fi

cd "${APP_DIR}"
docker compose config --quiet
if [[ -n "${app_container:-}" ]]; then
  # The existing installation was snapshotted before this checkout advanced.
  MWX_ISP_DIR="${APP_DIR}" bash "${APP_DIR}/scripts/vps-update.sh"
else
  # The project GHCR package must be public for passwordless VPS pulls.
  docker compose pull db app
  docker compose up -d --pull never
fi
docker compose ps

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  cat > /etc/systemd/system/mwx-isp-update.service <<EOF
[Unit]
Description=Update MWX-ISP container to the latest published image
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=MWX_ISP_DIR=${APP_DIR}
ExecStart=/usr/bin/env bash ${APP_DIR}/scripts/vps-auto-update.sh
EOF
  cat > /etc/systemd/system/mwx-isp-update.timer <<'EOF'
[Unit]
Description=Check daily for a newer MWX-ISP container image

[Timer]
OnCalendar=*-*-* 04:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  cat > /etc/systemd/system/mwx-isp-backup.service <<EOF
[Unit]
Description=Create a MWX-ISP database and application-data backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=MWX_ISP_DIR=${APP_DIR}
ExecStart=/usr/bin/env bash ${APP_DIR}/scripts/backup-db.sh
EOF
  cat > /etc/systemd/system/mwx-isp-backup.timer <<'EOF'
[Unit]
Description=Create a daily MWX-ISP backup

[Timer]
OnCalendar=*-*-* 03:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  chmod 0644 /etc/systemd/system/mwx-isp-{update,backup}.{service,timer}
  systemctl daemon-reload
  systemctl enable --now mwx-isp-update.timer mwx-isp-backup.timer
  echo "Enabled daily image updates and backups. Backups are stored in /var/backups/mwx-isp (30-day retention). Copy them off the VPS regularly."
else
  echo "systemd not detected; run updates with: MWX_ISP_DIR=${APP_DIR} bash ${APP_DIR}/scripts/vps-update.sh"
  echo "Create backups with: MWX_ISP_DIR=${APP_DIR} bash ${APP_DIR}/scripts/backup-db.sh"
fi

echo "MWX-ISP is running. Admin UI is bound to 127.0.0.1:${MWX_ISP_WEB_PORT:-1816}; configure a TLS reverse proxy before remote browser access."
echo "RADIUS auth/accounting and RadSec ports are exposed. Configure only the ports your NAS actually uses in the VPS firewall."
