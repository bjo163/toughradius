#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root: sudo bash scripts/vps-install.sh" >&2
  exit 1
fi

# Install Docker automatically on supported Debian/Ubuntu hosts. Other systems
# get an actionable message rather than failing later on a missing executable.
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  if [[ ! -r /etc/os-release ]]; then
    echo "Cannot identify this Linux distribution. Install Docker Engine and the Docker Compose plugin manually." >&2
    echo "Official guide: https://docs.docker.com/engine/install/" >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *)
      echo "Automatic Docker installation supports Ubuntu and Debian; detected '${PRETTY_NAME:-${ID:-unknown}}'." >&2
      echo "Install Docker Engine and the Docker Compose plugin, then rerun this script." >&2
      echo "Official guide: https://docs.docker.com/engine/install/" >&2
      exit 1
      ;;
  esac

  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get is required to install Docker automatically on ${ID}." >&2
    exit 1
  fi

  echo "Installing Docker Engine and Docker Compose plugin for ${PRETTY_NAME:-${ID}}..."
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  local arch codename
  arch="$(dpkg --print-architecture)"
  codename="${VERSION_CODENAME:-}"
  if [[ -z "${codename}" ]] && command -v lsb_release >/dev/null 2>&1; then
    codename="$(lsb_release -cs)"
  fi
  if [[ -z "${codename}" ]]; then
    echo "Could not determine the ${ID} release codename; install Docker manually." >&2
    exit 1
  fi

  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
    "${arch}" "${ID}" "${codename}" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_docker

for command in docker openssl git; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}." >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required (docker compose)." >&2
  exit 1
fi

mkdir -p "${APP_DIR}"
chmod 0750 "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "${APP_DIR} exists and is not an MWX-ISP git checkout; move or back up its contents first." >&2
    exit 1
  fi
  git clone --depth 1 --single-branch --branch main https://github.com/bjo163/mwx-isp.git "${APP_DIR}"
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  cp "${APP_DIR}/.env.vps.example" "${APP_DIR}/.env"
  sed -i "s|CHANGE_ME_generate_a_long_random_secret|$(openssl rand -hex 32)|" "${APP_DIR}/.env"
  sed -i "s|CHANGE_ME_use_a_unique_password|$(openssl rand -hex 20)|" "${APP_DIR}/.env"
  sed -i "s|CHANGE_ME_use_a_long_random_password|$(openssl rand -hex 32)|" "${APP_DIR}/.env"
  chmod 0600 "${APP_DIR}/.env"
  admin_password="$(openssl rand -hex 20)"
  sed -i "s|MWX_ISP_ADMIN_PASSWORD=.*|MWX_ISP_ADMIN_PASSWORD=${admin_password}|" "${APP_DIR}/.env"
  echo "MWX-ISP admin username: admin"
  echo "MWX-ISP admin password (store securely now): ${admin_password}"
fi

if grep -q 'CHANGE_ME' "${APP_DIR}/.env"; then
  echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2
  exit 1
fi

cd "${APP_DIR}"
docker compose config --quiet
docker compose pull db
docker compose build app
docker compose up -d
docker compose ps

chmod +x scripts/*.sh 2>/dev/null || true

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  cp scripts/mwx-isp-update.service /etc/systemd/system/mwx-isp-update.service
  cp scripts/mwx-isp-update.timer /etc/systemd/system/mwx-isp-update.timer
  chmod 0644 /etc/systemd/system/mwx-isp-update.service /etc/systemd/system/mwx-isp-update.timer
  systemctl daemon-reload
  systemctl enable --now mwx-isp-update.timer
  echo "Enabled daily automatic image updates with systemd timer mwx-isp-update.timer."
else
  echo "systemd not detected; enable updates manually with: cd ${APP_DIR} && scripts/vps-update.sh"
fi

echo "MWX-ISP is running. Admin UI is bound to 127.0.0.1:${MWX_ISP_WEB_PORT:-1816}; configure a TLS reverse proxy before remote browser access."
echo "RADIUS auth/accounting and RadSec ports are exposed. Configure only the ports your NAS actually uses in the VPS firewall."
echo "Database maintenance: use '${APP_DIR}/scripts/backup-db.sh' and '${APP_DIR}/scripts/restore-db.sh'."
