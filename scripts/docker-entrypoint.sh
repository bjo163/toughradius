#!/bin/sh
# Docker entrypoint script for ToughRADIUS
# Generates config from environment variables and starts the application

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

# Read environment variables with defaults
DB_TYPE="${TOUGHRADIUS_DB_TYPE:-postgres}"
DB_HOST="${TOUGHRADIUS_DB_HOST:-db}"
DB_PORT="${TOUGHRADIUS_DB_PORT:-5432}"
DB_USER="${TOUGHRADIUS_DB_USER:-postgres}"
DB_PASSWD="${TOUGHRADIUS_DB_PWD:-password}"
DB_NAME="${TOUGHRADIUS_DB_NAME:-toughradius}"
DB_DEBUG="${TOUGHRADIUS_DB_DEBUG:-false}"

SYS_DEBUG="${TOUGHRADIUS_SYSTEM_DEBUG:-false}"

WEB_HOST="${TOUGHRADIUS_WEB_HOST:-0.0.0.0}"
WEB_PORT="${TOUGHRADIUS_WEB_PORT:-1816}"
WEB_SECRET="${TOUGHRADIUS_WEB_SECRET:-your-secret-key}"

RADIUS_ENABLED="${TOUGHRADIUS_RADIUS_ENABLED:-true}"
RADIUS_HOST="${TOUGHRADIUS_RADIUS_HOST:-0.0.0.0}"
RADIUS_AUTHPORT="${TOUGHRADIUS_RADIUS_AUTHPORT:-1812}"
RADIUS_ACCTPORT="${TOUGHRADIUS_RADIUS_ACCTPORT:-1813}"
RADIUS_RADSEC_PORT="${TOUGHRADIUS_RADIUS_RADSEC_PORT:-2083}"
RADIUS_RADSEC_WORKER="${TOUGHRADIUS_RADIUS_RADSEC_WORKER:-2}"
RADIUS_DEBUG="${TOUGHRADIUS_RADIUS_DEBUG:-false}"

LOGGER_MODE="${TOUGHRADIUS_LOGGER_MODE:-production}"
LOGGER_FILE_ENABLE="${TOUGHRADIUS_LOGGER_FILE_ENABLE:-true}"

echo "[CONFIG] DB Type: $DB_TYPE"
echo "[CONFIG] DB Host: $DB_HOST"
echo ""

# Generate configuration from environment variables
echo "[CONFIG] Generating configuration from environment variables..."

cat > "$CONFIG_FILE" << YAML_CONFIG
system:
  appid: ToughRADIUS
  location: Asia/Jakarta
  workdir: /data
  debug: $SYS_DEBUG

database:
  type: $DB_TYPE
  host: $DB_HOST
  port: $DB_PORT
  user: $DB_USER
  passwd: $DB_PASSWD
  name: $DB_NAME
  debug: $DB_DEBUG

web:
  host: $WEB_HOST
  port: $WEB_PORT
  tlsport: 1817
  secret: $WEB_SECRET

radiusd:
  enabled: $RADIUS_ENABLED
  host: $RADIUS_HOST
  auth_port: $RADIUS_AUTHPORT
  acct_port: $RADIUS_ACCTPORT
  radsec_port: $RADIUS_RADSEC_PORT
  radsec_worker: $RADIUS_RADSEC_WORKER
  debug: $RADIUS_DEBUG

logger:
  mode: $LOGGER_MODE
  level: info
  file_enable: $LOGGER_FILE_ENABLE
  filename: /data/logs/toughradius.log

YAML_CONFIG

echo "[CONFIG] ✓ Configuration file created: $CONFIG_FILE"
echo ""

# Initialize database if needed
if [ "$INIT_DB" = "true" ]; then
    echo "[INIT] Starting database initialization check..."
    
    # Give database a moment to stabilize after container start
    sleep 2
    
    # Try to run application in "check" mode to see if database is ready
    # If database exists and has tables, it will show config loaded message
    # We'll just run -initdb and let it handle the logic
    echo "[INIT] Running: $APP_BIN -initdb -c $CONFIG_FILE"
    if "$APP_BIN" -initdb -c "$CONFIG_FILE"; then
        echo "[INIT] ✓ Database initialization completed successfully"
    else
        INIT_CODE=$?
        # Exit code 2 might mean database already initialized, which is OK
        if [ "$INIT_CODE" -eq 2 ]; then
            echo "[INIT] ✓ Database already initialized (code 2 - tables exist)"
        else
            echo "[INIT] ⚠ Database initialization exited with code $INIT_CODE"
        fi
    fi
    
    echo "[INIT] Waiting 3 seconds before starting main service..."
    sleep 3
fi

echo "[START] Starting ToughRADIUS main service..."
echo "==============================="
echo ""

# Run the application with proper signal handling
exec "$APP_BIN" -c "$CONFIG_FILE"
