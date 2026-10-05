#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
ENV_BACKUP="${APP_DIR}.env.uninstalled"
INTERACTIVE=false
CHECK_ONLY=false

# The previous uninstall release removed the directory a caller may be using
# as its current working directory. Recover immediately so later commands and
# git clone do not inherit a deleted cwd.
cd / || { echo "Cannot enter a safe working directory." >&2; exit 1; }

usage() {
  cat <<EOF
MWX-ISP VPS installer

Quick install:
  curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh | sudo bash

Usage: sudo bash scripts/vps-install.sh [--check] [--interactive]

  --check  Check host prerequisites and existing configuration without changes.
  --interactive  Choose Let's Encrypt, self-hosted HTTPS, or localhost HTTP,
                 and enter the hostname/timezone interactively.
  --yes    Use automatic defaults without prompting (the default behavior).
  --help   Show this help.

Environment:
  MWX_ISP_DIR        Install directory (default: /opt/mwx-isp)
  MWX_ISP_DOMAIN     Optional public domain (auto-detected when possible)
  MWX_ISP_TIMEZONE   Optional timezone (uses the server timezone or UTC)
EOF
}

while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --check) CHECK_ONLY=true ;;
    --interactive) INTERACTIVE=true ;;
    --yes|-y) INTERACTIVE=false ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "${EUID}" -ne 0 ]]; then echo "Run this installer as root: sudo bash scripts/vps-install.sh" >&2; exit 1; fi
if [[ ! "${APP_DIR}" =~ ^/[A-Za-z0-9_./-]+$ ]]; then
  echo "MWX_ISP_DIR must be an absolute path using only letters, numbers, dot, underscore, slash, and hyphen." >&2; exit 1
fi

if [[ -t 1 ]]; then
  COLOR_GREEN=$'\033[1;32m'
  COLOR_MUTED=$'\033[2m'
  COLOR_RESET=$'\033[0m'
else
  COLOR_GREEN=""
  COLOR_MUTED=""
  COLOR_RESET=""
fi
printf '\n%s  MWX-ISP%s  %sVPS INSTALLER%s\n' "${COLOR_GREEN}" "${COLOR_RESET}" "${COLOR_MUTED}" "${COLOR_RESET}"
printf '  PostgreSQL · Docker · secure first-run defaults\n\n'

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { printf '\n%s[%s]%s %s\n' "${COLOR_GREEN}" "$1" "${COLOR_RESET}" "$2"; }
report_error() {
  local status=$? line="$1"
  trap - ERR
  printf 'ERROR: Installer stopped unexpectedly at line %s (exit %s). Review the last step and rerun after correcting it.\n' "${line}" "${status}" >&2
  exit "${status}"
}
trap 'report_error "$LINENO"' ERR

check_host() {
  [[ -r /etc/os-release ]] || fail "Cannot identify this Linux distribution."
  if [[ -e "${APP_DIR}" && ! -d "${APP_DIR}" ]]; then fail "Install path ${APP_DIR} exists but is not a directory."; fi
  if [[ -d "${APP_DIR}" && ! -d "${APP_DIR}/.git" && -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    fail "${APP_DIR} contains files but is not an MWX-ISP checkout. Choose an empty MWX_ISP_DIR or back up its contents first."
  fi
  if [[ -d "${APP_DIR}/.git" ]] && command -v git >/dev/null 2>&1; then
    local remote_url
    remote_url="$(git -C "${APP_DIR}" remote get-url origin)" || fail "Could not read the Git origin in ${APP_DIR}."
    case "${remote_url}" in
      https://github.com/bjo163/mwx-isp.git|git@github.com:bjo163/mwx-isp.git) ;;
      *) fail "Unexpected origin remote (${remote_url}); refusing to install over another project." ;;
    esac
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  local missing=()
  for command in git openssl flock curl; do
    command -v "${command}" >/dev/null 2>&1 || missing+=("${command}")
  done
  if ((${#missing[@]})); then echo "Required host tools missing: ${missing[*]}"; fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker CLI and Compose plugin: available"
    if docker info >/dev/null 2>&1; then echo "Docker daemon: responding"; else echo "Docker daemon: not responding (installer will try to start it)"; fi
  else
    echo "Docker Engine/Compose: not ready (installer will install supported Ubuntu/Debian packages)"
    case "${ID:-}" in ubuntu|debian) ;; *) fail "Automatic installation supports Ubuntu and Debian; detected '${PRETTY_NAME:-${ID:-unknown}}'." ;; esac
  fi
  if command -v df >/dev/null 2>&1; then
    local space_path
    space_path="$(dirname "${APP_DIR}")"
    while [[ ! -d "${space_path}" && "${space_path}" != / ]]; do space_path="$(dirname "${space_path}")"; done
    df -h "${space_path}" | tail -n 1
  fi
}

if [[ "${CHECK_ONLY}" == true ]]; then
  step "1/6" "Checking host and required tools"
  check_host
  for command in git openssl flock curl; do command -v "${command}" >/dev/null 2>&1 || fail "Missing '${command}'. Install git, openssl, curl, and util-linux before continuing."; done
  if [[ -f "${APP_DIR}/.env" ]]; then
    step "2/6" "Checking existing MWX-ISP configuration"
    if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' "${APP_DIR}/.env"; then
      fail "An active .env value still contains CHANGE_ME. Review the affected setting before installing."
    fi
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      (cd "${APP_DIR}" && docker compose config --quiet) || fail "Compose configuration is invalid. Review ${APP_DIR}/.env."
    else
      echo "Docker/Compose configuration check skipped; Docker will be installed before deployment."
    fi
  else
    if [[ -f "${ENV_BACKUP}" ]]; then
      if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' "${ENV_BACKUP}" || ! grep -Eq '^POSTGRES_PASSWORD=.+$' "${ENV_BACKUP}" || ! grep -Eq '^MWX_ISP_WEB_SECRET=.+$' "${ENV_BACKUP}"; then
        fail "Preserved configuration ${ENV_BACKUP} exists but is incomplete or contains CHANGE_ME values; review it before reinstalling."
      fi
      echo "A preserved MWX-ISP configuration is available at ${ENV_BACKUP}; installation can restore it."
    else
      echo "No existing .env found; a new configuration will be generated during installation."
    fi
  fi
  echo "Preflight completed. No changes were made."
  exit 0
fi

install_docker() {
  local engine_ready=false
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      engine_ready=true
    elif command -v systemctl >/dev/null 2>&1 && systemctl cat docker.service >/dev/null 2>&1; then
      systemctl enable --now docker || fail "The installed Docker service failed to start. Check 'systemctl status docker' before rerunning."
      docker info >/dev/null 2>&1 || fail "Docker service started but the daemon is not responding. Check 'journalctl -u docker'."
      engine_ready=true
    fi
  fi
  if [[ "${engine_ready}" == true ]] && docker compose version >/dev/null 2>&1; then
    echo "Docker Engine and Compose are ready."
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
  command -v systemctl >/dev/null 2>&1 || fail "Automatic Docker installation requires systemd. Install Docker Engine manually, then rerun."
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
  if [[ "${engine_ready}" == true ]]; then
    # Keep an existing working Engine installation and add only the missing Compose plugin.
    apt-get install -y docker-compose-plugin
  else
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  systemctl enable --now docker
  docker info >/dev/null 2>&1 || fail "Docker was installed but the daemon is not responding. Check 'systemctl status docker'."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin did not install correctly."
}

step "1/6" "Checking host and required tools"
check_host
install_base_requirements() {
  local missing_packages=()
  command -v git >/dev/null 2>&1 || missing_packages+=(git)
  command -v openssl >/dev/null 2>&1 || missing_packages+=(openssl)
  command -v curl >/dev/null 2>&1 || missing_packages+=(curl)
  ((${#missing_packages[@]} == 0)) && return
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in ubuntu|debian) ;; *) fail "Missing ${missing_packages[*]}; install those tools manually for this distribution." ;; esac
  command -v apt-get >/dev/null 2>&1 || fail "apt-get is required to install ${missing_packages[*]}."
  echo "Installing required host tools: ${missing_packages[*]}"
  apt-get update
  apt-get install -y "${missing_packages[@]}"
}
command -v flock >/dev/null 2>&1 || fail "flock is required before any host changes. Install util-linux manually, then rerun."
exec 9>/run/lock/mwx-isp-update.lock
if ! flock -n 9; then fail "Another MWX-ISP install, update, or restore is running. Retry after it finishes."; fi
install_base_requirements

INSTALL_STATE="${APP_DIR}/.mwx-isp-install-state"
INSTALL_IN_PROGRESS=false
if [[ -f "${INSTALL_STATE}" ]] && grep -qx 'installing' "${INSTALL_STATE}"; then INSTALL_IN_PROGRESS=true; fi
temporary_env=""
cleanup_installer() { [[ -z "${temporary_env}" || ! -f "${temporary_env}" ]] || rm -f -- "${temporary_env}"; }
trap cleanup_installer EXIT

step "2/6" "Installing or verifying Docker Engine and Compose"
install_docker

docker info >/dev/null 2>&1 || fail "Docker daemon is not responding. Check 'systemctl status docker' and rerun."

valid_tls_hostname() {
  local hostname="$1"
  [[ "${hostname}" == localhost || "${hostname}" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$ ]]
}

infer_tls_mode() {
  local domain="${1,,}"
  case "${domain}" in
    localhost|127.*|*.local|*.localhost|*.internal|*.lan) printf 'http-local\n' ;;
    *.*)
      if [[ "${domain}" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || getent ahostsv4 "${domain}" 2>/dev/null | awk '{ print $1 }' | grep -Eq '^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
        printf 'internal\n'
      else
        printf 'letsencrypt\n'
      fi
      ;;
    *) printf 'internal\n' ;;
  esac
}

prompt_tls_settings() {
  local default_mode="$1" domain="$2" answer choice
  local default_choice=1
  case "${default_mode}" in internal) default_choice=2 ;; http-local) default_choice=3 ;; esac
  echo "Choose how the admin site will use HTTPS:"
  echo "  1) Let's Encrypt (public DNS name; ports 80 and 443 must reach this VPS)"
  echo "  2) Self-hosted HTTPS (Caddy internal CA; install its CA certificate on clients)"
  echo "  3) Local HTTP (loopback only; access remotely through an SSH tunnel)"
  read_prompt "TLS mode [1/2/3, default ${default_choice}]: "
  choice="${REPLY:-${default_choice}}"
  case "${choice}" in
    1) default_mode=letsencrypt ;;
    2) default_mode=internal ;;
    3) default_mode=http-local ;;
    *) fail "Choose 1 (Let's Encrypt), 2 (self-hosted HTTPS), or 3 (local HTTP)." ;;
  esac
  case "${default_mode}" in
    letsencrypt)
      [[ "${domain}" == localhost ]] && domain=""
      if [[ -n "${domain}" ]]; then
        read_prompt "Public DNS hostname pointing to this VPS [${domain}]: "
        domain="${REPLY:-${domain}}"
      else
        read_prompt "Public DNS hostname pointing to this VPS (required, e.g. isp.example.com): "
        domain="${REPLY}"
      fi
      ;;
    internal)
      [[ -n "${domain}" ]] || domain=localhost
      read_prompt "Hostname clients will use [${domain}]: "
      domain="${REPLY:-${domain}}"
      ;;
    http-local) domain=localhost ;;
  esac
  FIRST_RUN_TLS_MODE="${default_mode}"
  FIRST_RUN_DOMAIN="${domain}"
}

write_tls_settings() {
  local file="$1" mode="$2" domain="$3" caddy_address tls_directive caddy_bind
  case "${mode}" in
    letsencrypt)
      [[ "${domain}" != localhost && "${domain}" == *.* && ! "${domain}" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || fail "Let's Encrypt requires a public DNS hostname, not localhost or an IP address. Choose self-hosted HTTPS or local HTTP for this server."
      valid_tls_hostname "${domain}" || fail "Enter a valid DNS hostname without a scheme or port."
      case "${domain,,}" in *.local|*.localhost|*.internal|*.lan) fail "Let's Encrypt cannot issue public certificates for private hostname '${domain}'. Choose self-hosted HTTPS or local HTTP." ;; esac
      if ! getent ahosts "${domain}" >/dev/null 2>&1; then
        echo "WARNING: ${domain} does not resolve on this VPS yet; Let's Encrypt certificate provisioning will fail until public DNS points here." >&2
      fi
      caddy_address="${domain}"
      tls_directive=""
      caddy_bind="0.0.0.0"
      ;;
    internal)
      valid_tls_hostname "${domain}" || fail "Enter a valid hostname without a scheme or port for the self-hosted certificate."
      caddy_address="${domain}"
      tls_directive="tls internal"
      caddy_bind="0.0.0.0"
      ;;
    http-local)
      domain=localhost
      caddy_address="http://localhost"
      tls_directive=""
      caddy_bind="127.0.0.1"
      ;;
    *) fail "Unknown MWX_ISP_TLS_MODE '${mode}'. Choose letsencrypt, internal, or http-local." ;;
  esac
  set_env_value MWX_ISP_DOMAIN "${domain}" "${file}"
  set_env_value MWX_ISP_TLS_MODE "${mode}" "${file}"
  set_env_value MWX_ISP_CADDY_ADDRESS "${caddy_address}" "${file}"
  set_env_value MWX_ISP_CADDY_TLS_DIRECTIVE "${tls_directive}" "${file}"
  set_env_value MWX_ISP_CADDY_BIND "${caddy_bind}" "${file}"
}

configure_existing_tls_settings() {
  local file="$1" domain mode
  domain="$(sed -n 's/^MWX_ISP_DOMAIN=//p' "${file}" | tail -n 1)"
  domain="${domain:-localhost}"
  mode="$(sed -n 's/^MWX_ISP_TLS_MODE=//p' "${file}" | tail -n 1)"
  mode="${mode:-$(infer_tls_mode "${domain}")}"
  if [[ "${INTERACTIVE}" == true ]]; then
    [[ -t 0 || -r /dev/tty ]] || fail "--interactive needs a terminal. Run without that option for automatic defaults."
    prompt_tls_settings "${mode}" "${domain}"
    mode="${FIRST_RUN_TLS_MODE}"
    domain="${FIRST_RUN_DOMAIN}"
    echo "Admin hostname: ${domain}"
    echo "TLS mode: ${mode}"
    if [[ "${mode}" == letsencrypt ]]; then echo "Requirement: public DNS to this VPS and inbound TCP 80/443."; fi
    if [[ "${mode}" == internal ]]; then echo "Requirement: trust Caddy's root CA on every client device."; fi
    read_prompt "Apply these web access settings? [Y/n]: "
    [[ ! "${REPLY}" =~ ^[Nn]$ ]] || fail "TLS configuration was not changed. Rerun with the desired settings."
  fi
  write_tls_settings "${file}" "${mode}" "${domain}"
}

read_first_run_settings() {
  local domain timezone answer
  domain="${MWX_ISP_DOMAIN:-}"
  timezone="${MWX_ISP_TIMEZONE:-}"
  if [[ -z "${domain}" ]]; then
    local detected_domain
    detected_domain="$(hostname -f 2>/dev/null || true)"
    case "${detected_domain,,}" in *.local|*.localhost|*.internal|*.lan) detected_domain="" ;; esac
    if [[ "${detected_domain}" == *.* ]] && getent ahosts "${detected_domain}" >/dev/null 2>&1; then
      domain="${detected_domain}"
      echo "Detected server hostname: ${domain}"
    else
      domain=localhost
      echo "No resolvable server hostname detected; using localhost with secure SSH-tunnel access."
    fi
  fi
  if [[ "${domain}" != localhost && "${domain}" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
    domain="${domain}"
  fi
  if [[ -z "${timezone}" ]]; then
    if command -v timedatectl >/dev/null 2>&1; then
      timezone="$(timedatectl show -p Timezone --value 2>/dev/null || true)"
    fi
    if [[ -z "${timezone}" && -L /etc/localtime ]]; then
      timezone="$(readlink /etc/localtime | sed 's#^.*/zoneinfo/##')"
    fi
    timezone="${timezone:-UTC}"
  fi
  if [[ "${INTERACTIVE}" == true ]]; then
    [[ -t 0 || -r /dev/tty ]] || fail "--interactive needs a terminal. Run without that option for automatic defaults."
    prompt_tls_settings "$(infer_tls_mode "${domain}")" "${domain}"
    domain="${FIRST_RUN_DOMAIN}"
    read_prompt "Server timezone [${timezone}]: "
    answer="${REPLY}"
    timezone="${answer:-${timezone}}"
  else
    FIRST_RUN_TLS_MODE="$(infer_tls_mode "${domain}")"
  fi
  [[ "${timezone}" =~ ^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$ && -e "/usr/share/zoneinfo/${timezone}" ]] || fail "Unknown or invalid timezone '${timezone}'."
  FIRST_RUN_DOMAIN="${domain}"
  FIRST_RUN_TIMEZONE="${timezone}"
}

confirm_first_run_settings() {
  echo
  echo "Installation summary"
  echo "  Install directory: ${APP_DIR}"
  echo "  Admin URL:         ${FIRST_RUN_DOMAIN}"
  echo "  TLS mode:          ${FIRST_RUN_TLS_MODE}"
  echo "  Timezone:          ${FIRST_RUN_TIMEZONE}"
  echo "  Data store:        PostgreSQL"
  echo "  Services:          MWX-ISP, Caddy, automatic backup/update timers (systemd)"
  case "${FIRST_RUN_TLS_MODE}" in
    letsencrypt) echo "  HTTPS needs:       Public DNS to this VPS and inbound TCP 80/443" ;;
    internal) echo "  HTTPS trust:       Install Caddy's local CA certificate on each client" ;;
    http-local) echo "  Web access:        Loopback only; use the printed SSH tunnel" ;;
  esac
  if [[ "${INTERACTIVE}" == true ]]; then
    local answer
    [[ -t 0 || -r /dev/tty ]] || fail "--interactive needs a terminal. Run without that option for automatic defaults."
    read_prompt "Continue with these settings? [Y/n]: "
    answer="${REPLY}"
    [[ ! "${answer}" =~ ^[Nn]$ ]] || fail "Installation cancelled before writing .env."
  fi
}

set_env_value() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

read_prompt() {
  local prompt="$1"
  if [[ -r /dev/tty ]]; then
    read -r -p "${prompt}" REPLY </dev/tty || true
  else
    read -r -p "${prompt}" REPLY || true
  fi
}

wait_for_healthy_service() {
  local service="$1" container_id state attempt
  container_id="$(docker compose ps -q "${service}")"
  [[ -n "${container_id}" ]] || fail "Compose did not create the '${service}' container. Inspect 'docker compose ps' in ${APP_DIR}."
  for attempt in $(seq 1 180); do
    state="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
    [[ "${state}" == healthy ]] && { echo "${service}: healthy"; return 0; }
    if [[ "${state}" == unhealthy || "${state}" == exited || -z "${state}" ]]; then
      echo "${service}: ${state:-unavailable}" >&2
      docker compose ps >&2 || true
      fail "${service} did not become healthy. Inspect logs with: cd ${APP_DIR} && docker compose logs --tail=100 ${service}"
    fi
    sleep 1
  done
  docker compose ps >&2 || true
  fail "${service} did not become healthy within 180 seconds. Inspect logs with: cd ${APP_DIR} && docker compose logs --tail=100 ${service}"
}

wait_for_running_service() {
  local service="$1" container_id state attempt
  container_id="$(docker compose ps -q "${service}")"
  [[ -n "${container_id}" ]] || fail "Compose did not create the '${service}' container. Inspect 'docker compose ps' in ${APP_DIR}."
  for attempt in $(seq 1 30); do
    state="$(docker inspect --format='{{.State.Status}}' "${container_id}" 2>/dev/null || true)"
    [[ "${state}" == running ]] && { echo "${service}: running"; return 0; }
    if [[ "${state}" == exited || -z "${state}" ]]; then
      docker compose ps >&2 || true
      fail "${service} is not running. Inspect logs with: cd ${APP_DIR} && docker compose logs --tail=100 ${service}"
    fi
    sleep 1
  done
  fail "${service} did not start within 30 seconds. Inspect logs with: cd ${APP_DIR} && docker compose logs --tail=100 ${service}"
}

wait_for_http_endpoint() {
  local url="$1" label="$2" allow_redirects="${3:-false}" host_header="${4:-}" attempt status
  local -a curl_args=(--silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 5)
  [[ -z "${host_header}" ]] || curl_args+=(--header "Host: ${host_header}")
  for attempt in $(seq 1 30); do
    status="$(curl "${curl_args[@]}" "${url}" 2>/dev/null || true)"
    if [[ "${status}" =~ ^2[0-9][0-9]$ ]]; then
      echo "${label}: HTTP ${status}"
      return 0
    fi
    if [[ "${allow_redirects}" == true && "${status}" =~ ^3[0-9][0-9]$ ]]; then
      echo "${label}: HTTP ${status} (redirect configured)"
      return 0
    fi
    sleep 2
  done
  fail "${label} did not return HTTP success (last status: ${status:-no response}). Check Caddy logs, hostname/DNS, and port 80/443 availability."
}

wait_for_https_endpoint() {
  local hostname="$1" mode="$2" attempt status
  local -a curl_args=(--silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 5 --noproxy '*' --resolve "${hostname}:443:127.0.0.1")
  [[ "${mode}" != internal ]] || curl_args+=(--insecure)
  for attempt in $(seq 1 90); do
    status="$(curl "${curl_args[@]}" "https://${hostname}/admin/" 2>/dev/null || true)"
    if [[ "${status}" =~ ^[23][0-9][0-9]$ ]]; then
      echo "Caddy HTTPS certificate: ready (${mode})"
      return 0
    fi
    sleep 2
  done
  fail "Caddy did not serve HTTPS for ${hostname}. For Let's Encrypt, verify public DNS points to this VPS and inbound TCP 80/443 is reachable; otherwise rerun with --interactive and choose self-hosted HTTPS or local HTTP."
}

mkdir -p "${APP_DIR}"
[[ -d "${APP_DIR}" ]] || fail "Install path ${APP_DIR} is not a directory."
if [[ ! -d "${APP_DIR}/.git" && -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  fail "${APP_DIR} exists and contains files but is not an MWX-ISP git checkout; move or back up its contents first."
fi
chmod 0750 "${APP_DIR}"
if [[ ! -f "${APP_DIR}/.env" && -f "${ENV_BACKUP}" ]]; then
  if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' "${ENV_BACKUP}"; then
    fail "Preserved configuration ${ENV_BACKUP} contains an unresolved CHANGE_ME value. Review it manually; it was not restored."
  fi
  if ! grep -Eq '^POSTGRES_PASSWORD=.+$' "${ENV_BACKUP}" || ! grep -Eq '^MWX_ISP_WEB_SECRET=.+$' "${ENV_BACKUP}"; then
    fail "Preserved configuration ${ENV_BACKUP} is incomplete. Restore a known-good .env backup manually."
  fi
  install -m 0600 -o root -g root -- "${ENV_BACKUP}" "${APP_DIR}/.env"
  echo "Restored the configuration saved by the MWX-ISP uninstaller from ${ENV_BACKUP}."
fi
step "3/6" "Preparing the MWX-ISP checkout"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone --depth 1 --single-branch --branch main https://github.com/bjo163/mwx-isp.git "${APP_DIR}"
else
  remote_url="$(git -C "${APP_DIR}" remote get-url origin)"
  case "${remote_url}" in https://github.com/bjo163/mwx-isp.git|git@github.com:bjo163/mwx-isp.git) ;; *) echo "Unexpected origin remote (${remote_url}); refusing to install over another project." >&2; exit 1 ;; esac
  if [[ -n "$(git -C "${APP_DIR}" status --porcelain)" ]]; then
    dirty_backup_dir="${APP_DIR}.local-changes.$(date -u +%Y%m%dT%H%M%SZ)"
    [[ ! -e "${dirty_backup_dir}" ]] || fail "Local-change backup path ${dirty_backup_dir} already exists; move it before retrying."
    echo "Uncommitted checkout changes found. Saving a complete copy to ${dirty_backup_dir} before updating."
    cp -a -- "${APP_DIR}" "${dirty_backup_dir}" || fail "Could not preserve local changes to ${dirty_backup_dir}; checkout was not updated."
  fi
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
  ensure_existing_services_ready_for_backup() {
    if [[ -z "${any_app_container}" && -z "${any_db_container}" ]]; then
      local volume driver mountpoint contents
      local -a orphaned_empty_volumes=()
      for volume in mwx-isp_postgres_data mwx-isp_mwx_isp_data; do
        if docker volume inspect "${volume}" >/dev/null 2>&1; then
          driver="$(docker volume inspect --format '{{.Driver}}' "${volume}")"
          mountpoint="$(docker volume inspect --format '{{.Mountpoint}}' "${volume}")"
          [[ "${driver}" == local && -d "${mountpoint}" ]] || fail "MWX-ISP volume '${volume}' exists without its containers and cannot be inspected safely. It was left untouched; restore the original services or a verified backup."
          contents="$(find "${mountpoint}" -mindepth 1 -maxdepth 1 -print -quit)"
          [[ -z "${contents}" ]] || fail "MWX-ISP volume '${volume}' contains files but its containers are missing. It was left untouched; restore the original services or a verified backup before retrying."
          orphaned_empty_volumes+=("${volume}")
        fi
      done
      ((${#orphaned_empty_volumes[@]} > 0)) || fail "MWX-ISP state was detected but no original app/db containers or inspectable data volumes are available. No data was changed."
      echo "No original containers exist; only empty MWX-ISP data volumes were found. Removing those empty volumes to continue as a clean install."
      docker volume rm "${orphaned_empty_volumes[@]}" >/dev/null
      return 1
    fi
    if [[ -z "${any_app_container}" || -z "${any_db_container}" ]]; then
      fail "Existing MWX-ISP data was found, but both existing app and db containers are not available. No new containers were created and no data was changed; restore the matching .env and recover the original services before retrying."
    fi
    if [[ -z "${app_container}" || -z "${db_container}" ]]; then
      echo "Starting the existing stopped MWX-ISP app and db containers without pulling or recreating them, so a safety backup can be made."
      docker compose start db app || fail "Could not start the existing app and db containers. No update was performed; inspect 'docker compose logs' and retry."
      app_container="$(docker compose ps -q app | head -n 1 || true)"
      db_container="$(docker compose ps -q db | head -n 1 || true)"
    fi
    wait_for_healthy_service db
    wait_for_healthy_service app
  }
  if [[ -n "${any_app_container}" || -n "${any_db_container}" || -n "${existing_data}" ]]; then
  if [[ "${INSTALL_IN_PROGRESS}" == true ]]; then
        if ensure_existing_services_ready_for_backup; then
          step "4/6" "Creating a safety backup before resuming the interrupted installation"
          git -C "${APP_DIR}" show origin/main:scripts/backup-db.sh | MWX_ISP_DIR="${APP_DIR}" bash -- --quiet
          echo "Resuming an interrupted install with its existing configuration and volumes."
        else
          echo "Continuing the interrupted first installation after clearing only empty data volumes."
        fi
      else
        if ensure_existing_services_ready_for_backup; then
          step "4/6" "Creating a safety backup before updating an existing installation"
          git -C "${APP_DIR}" show origin/main:scripts/backup-db.sh | MWX_ISP_DIR="${APP_DIR}" bash -- --quiet
        else
          echo "Proceeding as a clean installation after clearing only empty data volumes."
        fi
      fi
    fi
  fi
  git -C "${APP_DIR}" reset --hard origin/main
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  existing_install_container="$(docker ps -aq --filter label=com.docker.compose.project=mwx-isp | head -n 1 || true)"
  if docker volume inspect mwx-isp_postgres_data >/dev/null 2>&1; then
    [[ -z "${existing_install_container}" ]] || fail "MWX-ISP containers exist but ${APP_DIR}/.env is missing. Restore the matching .env before continuing; no data was changed."
    volume_driver="$(docker volume inspect --format '{{.Driver}}' mwx-isp_postgres_data)"
    volume_mountpoint="$(docker volume inspect --format '{{.Mountpoint}}' mwx-isp_postgres_data)"
    [[ "${volume_driver}" == local && -d "${volume_mountpoint}" ]] || fail "Cannot safely inspect PostgreSQL volume 'mwx-isp_postgres_data' (driver: ${volume_driver}). Restore the matching .env before continuing; no data was changed."
    if [[ -s "${volume_mountpoint}/PG_VERSION" ]]; then
      fail "PostgreSQL data volume 'mwx-isp_postgres_data' contains a database but ${APP_DIR}/.env is missing. Restore ${ENV_BACKUP} or another matching .env backup; no volume or database data was changed."
    fi
    volume_contents="$(find "${volume_mountpoint}" -mindepth 1 -maxdepth 1 -print -quit)"
    [[ -z "${volume_contents}" ]] || fail "PostgreSQL volume 'mwx-isp_postgres_data' is not initialized but contains files. It was left untouched; inspect or back it up before continuing."
    echo "Found an uninitialized PostgreSQL volume from an interrupted clean install; removing that empty volume before generating fresh credentials."
    docker volume rm mwx-isp_postgres_data >/dev/null
  fi
  if docker volume inspect mwx-isp_mwx_isp_data >/dev/null 2>&1; then
    fail "Application data volume 'mwx-isp_mwx_isp_data' exists but ${APP_DIR}/.env is missing. Restore the matching .env backup before continuing; no data was changed."
  fi
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  step "4/6" "Configuring a new installation"
  read_first_run_settings
  confirm_first_run_settings
  INSTALL_IN_PROGRESS=true
  temporary_env="$(mktemp "${APP_DIR}/.env.installing.XXXXXX")"
  cp "${APP_DIR}/.env.vps.example" "${temporary_env}"
  admin_password="$(openssl rand -hex 20)"
  sed -i "s|CHANGE_ME_generate_a_long_random_secret|$(openssl rand -hex 32)|" "${temporary_env}"
  sed -i "s|CHANGE_ME_use_a_unique_password|${admin_password}|" "${temporary_env}"
  sed -i "s|CHANGE_ME_use_a_long_random_password|$(openssl rand -hex 32)|" "${temporary_env}"
  set_env_value TZ "${FIRST_RUN_TIMEZONE}" "${temporary_env}"
  write_tls_settings "${temporary_env}" "${FIRST_RUN_TLS_MODE}" "${FIRST_RUN_DOMAIN}"
  chmod 0600 "${temporary_env}"
  chown root:root "${temporary_env}"
  mv -f "${temporary_env}" "${APP_DIR}/.env"
  temporary_env=""
  printf 'installing\n' > "${INSTALL_STATE}.tmp"
  mv -f "${INSTALL_STATE}.tmp" "${INSTALL_STATE}"
  echo "MWX-ISP admin username: admin"
  echo "MWX-ISP admin password (store securely now): ${admin_password}"
elif [[ "${INSTALL_IN_PROGRESS}" == true ]]; then
  step "4/6" "Resuming a previously interrupted first installation"
  if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' "${APP_DIR}/.env"; then
    sed -i "s|CHANGE_ME_generate_a_long_random_secret|$(openssl rand -hex 32)|g" "${APP_DIR}/.env"
    sed -i "s|CHANGE_ME_use_a_unique_password|$(openssl rand -hex 20)|g" "${APP_DIR}/.env"
    sed -i "s|CHANGE_ME_use_a_long_random_password|$(openssl rand -hex 32)|g" "${APP_DIR}/.env"
  fi
  admin_password="$(sed -n 's/^MWX_ISP_ADMIN_PASSWORD=//p' "${APP_DIR}/.env" | tail -n 1)"
  if [[ "${INTERACTIVE}" == true ]]; then configure_existing_tls_settings "${APP_DIR}/.env"; fi
  echo "MWX-ISP admin username: admin"
  echo "MWX-ISP admin password (store securely now): ${admin_password}"
fi
if [[ -z "${FIRST_RUN_TLS_MODE:-}" ]]; then
  configure_existing_tls_settings "${APP_DIR}/.env"
fi
chmod 0600 "${APP_DIR}/.env"
chown root:root "${APP_DIR}/.env"
if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CHANGE_ME' "${APP_DIR}/.env"; then echo "Replace all CHANGE_ME values in ${APP_DIR}/.env first." >&2; exit 1; fi
if [[ -z "${app_container:-}" && ! -f "${INSTALL_STATE}" ]]; then
  # A configured but not yet running checkout is a new install, not an upgrade.
  INSTALL_IN_PROGRESS=true
  printf 'installing\n' > "${INSTALL_STATE}.tmp"
  mv -f "${INSTALL_STATE}.tmp" "${INSTALL_STATE}"
fi

cd "${APP_DIR}"
step "5/6" "Starting services and verifying readiness"
docker compose config --quiet || fail "Compose configuration is invalid. Review ${APP_DIR}/.env and rerun."
if [[ -n "${app_container:-}" && "${INSTALL_IN_PROGRESS}" != true ]]; then
  # The existing installation was snapshotted before this checkout advanced.
  MWX_ISP_DEPLOY_LOCK_HELD=true MWX_ISP_DIR="${APP_DIR}" bash "${APP_DIR}/scripts/vps-update.sh"
else
  # The project GHCR package must be public for passwordless VPS pulls.
  # Pull every service image before --pull never starts the complete stack.
  # In particular, Caddy is a Docker Hub image and is not included in db/app.
  docker compose pull || fail "Could not pull all service images. Check DNS/network access to Docker Hub and GHCR, then rerun."
  docker compose up -d --pull never || fail "Could not start the application stack. Check port conflicts and inspect 'docker compose logs'."
  wait_for_healthy_service db
  wait_for_healthy_service app
fi
docker compose up -d caddy || fail "Could not start Caddy. Check whether TCP 80/443 are already in use, then inspect 'docker compose logs caddy'."
wait_for_running_service caddy
docker compose ps

domain="$(awk -F= '$1 == "MWX_ISP_DOMAIN" { print substr($0, index($0, "=") + 1) }' .env | tail -n 1)"
tls_mode="$(sed -n 's/^MWX_ISP_TLS_MODE=//p' .env | tail -n 1)"
web_port="$(sed -n 's/^MWX_ISP_WEB_PORT=//p' .env | tail -n 1)"
web_port="${web_port:-1816}"
if [[ "${tls_mode}" == letsencrypt && "${domain}" != localhost ]] && ! getent ahosts "${domain}" >/dev/null 2>&1; then
  echo "WARNING: ${domain} does not currently resolve from this server. Caddy HTTPS may stay unavailable until DNS points to this VPS." >&2
fi
wait_for_http_endpoint "http://127.0.0.1:${web_port}/admin/" "MWX-ISP admin endpoint"
if [[ "${domain}" == localhost ]]; then caddy_host="localhost"; else caddy_host="${domain}"; fi
if [[ "${tls_mode}" == http-local ]]; then
  wait_for_http_endpoint "http://127.0.0.1/" "Caddy local HTTP proxy" false "${caddy_host}"
else
  wait_for_http_endpoint "http://127.0.0.1/" "Caddy HTTPS redirect" true "${caddy_host}"
  wait_for_https_endpoint "${caddy_host}" "${tls_mode}"
fi

chmod +x scripts/*.sh 2>/dev/null || true

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

printf 'complete\n' > "${INSTALL_STATE}.tmp"
mv -f "${INSTALL_STATE}.tmp" "${INSTALL_STATE}"
step "6/6" "Installation complete"
case "${tls_mode}" in
  letsencrypt)
    echo "Admin UI: https://${domain}/admin/"
    echo "Let's Encrypt requires public DNS pointing to this VPS and inbound TCP 80/443."
    ;;
  internal)
    echo "Admin UI: https://${domain}/admin/ (self-hosted Caddy CA; clients must trust the CA)."
    echo "Ensure ${domain} resolves to this VPS on client devices. Export the CA with: cd ${APP_DIR} && docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt /root/mwx-isp-caddy-root.crt"
    echo "Copy /root/mwx-isp-caddy-root.crt securely to client devices and add it to their trusted root certificates."
    ;;
  http-local)
    echo "Admin UI through SSH tunnel: http://localhost:${web_port}/admin/"
    echo "Remote access: ssh -L ${web_port}:127.0.0.1:${web_port} <ssh-user>@<server-ip>, then open the URL above."
    ;;
esac
echo "Ready: PostgreSQL, MWX-ISP, and Caddy local routing passed their checks."
echo "Save the generated admin password printed above."
echo "Open only the NAS ports you use: UDP 1812 (auth), UDP 1813 (accounting), TCP 2083 (RadSec). PostgreSQL is private."
echo "The installer did not change your host firewall. Configure firewall rules using your existing SSH access method."
echo "Database maintenance: use '${APP_DIR}/scripts/backup-db.sh' and '${APP_DIR}/scripts/restore-db.sh'."
