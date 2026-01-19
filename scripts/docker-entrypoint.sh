#!/bin/sh
# Docker entrypoint script for ToughRADIUS
# This script initializes the application and starts the RADIUS server

APP_BIN="${APP_BIN:-/usr/local/bin/toughradius}"
CONFIG_FILE="${CONFIG_FILE:-/etc/toughradius.yml}"
INIT_DB="${INIT_DB:-true}"

echo "==============================="
echo "ToughRADIUS Docker Entrypoint"
echo "==============================="
echo "Binary: $APP_BIN"
echo "Config: $CONFIG_FILE"
echo "Init DB: $INIT_DB"
echo ""

# Initialize database if INIT_DB is true
if [ "$INIT_DB" = "true" ]; then
    echo "[INIT] Starting database initialization..."
    
    # Give database a moment to stabilize after container start
    sleep 2
    
    # Run initialization - this creates tables and default admin
    # Note: -initdb will drop and recreate all tables
    echo "[INIT] Running: $APP_BIN -initdb -c $CONFIG_FILE"
    if "$APP_BIN" -initdb -c "$CONFIG_FILE"; then
        echo "[INIT] ✓ Database initialization completed successfully"
    else
        INIT_CODE=$?
        echo "[INIT] ⚠ Database initialization exited with code $INIT_CODE"
        # Don't fail - let the main app start and handle any issues
    fi
    
    echo "[INIT] Waiting 3 seconds before starting main service..."
    sleep 3
fi

echo "[START] Starting ToughRADIUS main service..."
echo "==============================="
echo ""

# Run the application with proper signal handling
exec "$APP_BIN" -c "$CONFIG_FILE"
