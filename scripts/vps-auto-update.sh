#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
cd "${APP_DIR}"

exec /usr/bin/env bash "${APP_DIR}/scripts/vps-update.sh"
