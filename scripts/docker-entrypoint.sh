#!/bin/sh
# Docker entrypoint script for ToughRADIUS
# This script initializes the application and starts the RADIUS server

set -e

APP_BIN="${APP_BIN:-/usr/local/bin/toughradius}"
CONFIG_FILE="${CONFIG_FILE:-/etc/toughradius.yml}"
INIT_DB="${INIT_DB:-true}"

echo "ToughRADIUS Docker Entrypoint"
echo "==============================="
echo "Binary: $APP_BIN"
echo "Config: $CONFIG_FILE"
echo "Init DB: $INIT_DB"

# Initialize database if INIT_DB is true
if [ "$INIT_DB" = "true" ]; then
    echo "Initializing database..."
    # Try to initialize, but don't fail if it already exists
    "$APP_BIN" -initdb -c "$CONFIG_FILE" || true
    sleep 2
fi

echo "Starting ToughRADIUS..."
exec "$APP_BIN" -c "$CONFIG_FILE"
