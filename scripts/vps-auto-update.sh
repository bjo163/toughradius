#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MWX_ISP_DIR:-/opt/mwx-isp}"
cd "${APP_DIR}"

# Serialize cron/systemd invocations so image swaps never overlap.
exec 9>/run/lock/mwx-isp-update.lock
if ! flock -n 9; then
  echo "Another MWX-ISP update is already running."
  exit 0
fi

"${APP_DIR}/scripts/vps-update.sh"
