#!/usr/bin/env bash
set -Eeuo pipefail

INSTALLER_URL="https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-install.sh"
temporary_installer=""
cleanup() { [[ -z "${temporary_installer}" || ! -f "${temporary_installer}" ]] || rm -f -- "${temporary_installer}"; }
trap cleanup EXIT

command -v curl >/dev/null 2>&1 || { echo "curl is required to download the current MWX-ISP installer." >&2; exit 1; }
command -v bash >/dev/null 2>&1 || { echo "bash is required to run the MWX-ISP installer." >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || { echo "Run as root: curl -fsSL https://raw.githubusercontent.com/bjo163/mwx-isp/main/scripts/vps-repair.sh | sudo bash" >&2; exit 1; }
cd / || { echo "Cannot enter a safe working directory." >&2; exit 1; }

temporary_installer="$(mktemp /tmp/mwx-isp-installer.XXXXXX)"
chmod 0700 "${temporary_installer}"
curl --fail --silent --show-error --location --retry 3 --retry-delay 2 "${INSTALLER_URL}" --output "${temporary_installer}"
bash -n "${temporary_installer}" || { echo "Downloaded installer failed shell syntax validation; no repair was attempted." >&2; exit 1; }

echo "Starting the current MWX-ISP installer in safe upgrade/repair mode."
echo "Existing credentials and database volumes are preserved; the installer creates a backup before updating a running installation."
installer_args=()
if [[ $# -eq 0 ]]; then
  if [[ -t 0 || -r /dev/tty ]]; then
    installer_args+=(--interactive)
  else
    installer_args+=(--yes)
  fi
else
  installer_args+=("$@")
fi

if [[ -r /dev/tty ]]; then
  bash "${temporary_installer}" "${installer_args[@]}" </dev/tty
else
  bash "${temporary_installer}" "${installer_args[@]}"
fi
