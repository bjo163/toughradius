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

# Generate configuration from environment variables
echo "[CONFIG] Generating configuration from environment variables..."

cat > "$CONFIG_FILE" << 'YAML_CONFIG'
system:
  appid: ToughRADIUS
  location: Asia/Jakarta
  workdir: /data
  debug: ${TOUGHRADIUS_SYSTEM_DEBUG:-false}

database:
  type: ${TOUGHRADIUS_DB_TYPE:-postgres}
  host: ${TOUGHRADIUS_DB_HOST:-db}
  port: ${TOUGHRADIUS_DB_PORT:-5432}
  user: ${TOUGHRADIUS_DB_USER:-postgres}
  passwd: ${TOUGHRADIUS_DB_PWD:-password}
  name: ${TOUGHRADIUS_DB_NAME:-toughradius}
  debug: ${TOUGHRADIUS_DB_DEBUG:-false}

web:
  host: ${TOUGHRADIUS_WEB_HOST:-0.0.0.0}
  port: ${TOUGHRADIUS_WEB_PORT:-1816}
  tlsport: 1817
  secret: ${TOUGHRADIUS_WEB_SECRET:-your-secret-key}

radiusd:
  enabled: ${TOUGHRADIUS_RADIUS_ENABLED:-true}
  host: ${TOUGHRADIUS_RADIUS_HOST:-0.0.0.0}
  auth_port: ${TOUGHRADIUS_RADIUS_AUTHPORT:-1812}
  acct_port: ${TOUGHRADIUS_RADIUS_ACCTPORT:-1813}
  radsec_port: ${TOUGHRADIUS_RADIUS_RADSEC_PORT:-2083}
  radsec_worker: ${TOUGHRADIUS_RADIUS_RADSEC_WORKER:-2}
  debug: ${TOUGHRADIUS_RADIUS_DEBUG:-false}

logger:
  mode: ${TOUGHRADIUS_LOGGER_MODE:-production}
  level: info
  file_enable: ${TOUGHRADIUS_LOGGER_FILE_ENABLE:-true}
  filename: /data/logs/toughradius.log

YAML_CONFIG

# Replace environment variables in the config file
if command -v envsubst >/dev/null 2>&1; then
    echo "[CONFIG] Applying environment variable substitution..."
    envsubst < "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
    mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
else
    echo "[CONFIG] Warning: envsubst not available, using basic sed substitution"
    # Basic sed substitution for key env variables
    sed -i "s|\${TOUGHRADIUS_DB_TYPE:-postgres}|${TOUGHRADIUS_DB_TYPE:-postgres}|g" "$CONFIG_FILE"
    sed -i "s|\${TOUGHRADIUS_DB_HOST:-db}|${TOUGHRADIUS_DB_HOST:-db}|g" "$CONFIG_FILE"
    sed -i "s|\${TOUGHRADIUS_DB_PORT:-5432}|${TOUGHRADIUS_DB_PORT:-5432}|g" "$CONFIG_FILE"
    sed -i "s|\${TOUGHRADIUS_DB_USER:-postgres}|${TOUGHRADIUS_DB_USER:-postgres}|g" "$CONFIG_FILE"
    sed -i "s|\${TOUGHRADIUS_DB_PWD:-password}|${TOUGHRADIUS_DB_PWD:-password}|g" "$CONFIG_FILE"
    sed -i "s|\${TOUGHRADIUS_DB_NAME:-toughradius}|${TOUGHRADIUS_DB_NAME:-toughradius}|g" "$CONFIG_FILE"
fi

echo "[CONFIG] ✓ Configuration file created: $CONFIG_FILE"
echo ""

# Initialize database if INIT_DB is true
if [ "$INIT_DB" = "true" ]; then
    echo "[INIT] Starting database initialization..."
    
    # Give database a moment to stabilize after container start
    sleep 2
    
    # Run initialization - this creates tables and default admin
    echo "[INIT] Running: $APP_BIN -initdb -c $CONFIG_FILE"
    if "$APP_BIN" -initdb -c "$CONFIG_FILE"; then
        echo "[INIT] ✓ Database initialization completed successfully"
    else
        INIT_CODE=$?
        echo "[INIT] ⚠ Database initialization exited with code $INIT_CODE"
    fi
    
    echo "[INIT] Waiting 3 seconds before starting main service..."
    sleep 3
fi

echo "[START] Starting ToughRADIUS main service..."
echo "==============================="
echo ""

# Run the application with proper signal handling
exec "$APP_BIN" -c "$CONFIG_FILE"
