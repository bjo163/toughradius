# Docker Deployment Guide

## Quick Start dengan Docker Compose

ToughRADIUS sekarang fully integrated dengan Docker dan PostgreSQL untuk production-ready deployment.

### Prerequisites

- Docker & Docker Compose
- Minimal 2GB RAM
- Port availability: 1816 (Web), 1812 (RADIUS Auth), 1813 (RADIUS Acct), 2083 (RadSec optional)

### Launch dengan Docker Compose

```bash
# Clone repository
git clone https://github.com/talkincode/toughradius.git
cd toughradius

# Build dan start services
docker-compose up --build

# Atau run in background
docker-compose up -d --build
```

### Access Web Management Interface

- **URL**: http://localhost:1816
- **Default Credentials**:
  - Username: `admin`
  - Password: `toughradius`
  - **⚠️ Change password immediately after first login!**

### Verify Services

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f toughradius

# Check database connection
docker-compose logs toughradius | grep "Database connected"

# Test RADIUS auth port
docker-compose exec toughradius curl -s http://localhost:1816/ready | jq .
```

## Database Configuration

### PostgreSQL (Recommended for Production)

Docker-compose ini sudah pre-configured untuk PostgreSQL:

```yaml
database:
  type: postgres
  host: db          # Docker service name
  port: 5432
  user: postgres
  password: mypassword
  name: toughradius
```

**Environment Variables di docker-compose:**
```
TOUGHRADIUS_DB_TYPE=postgres
TOUGHRADIUS_DB_HOST=db
TOUGHRADIUS_DB_PORT=5432
TOUGHRADIUS_DB_NAME=toughradius
TOUGHRADIUS_DB_USER=postgres
TOUGHRADIUS_DB_PWD=mypassword
```

### Auto-Initialization

ToughRADIUS automatically initializes the database on first startup:

```bash
# This happens automatically via docker-entrypoint.sh
# Equivalent to running:
toughradius -initdb -c /etc/toughradius.yml
```

Database initialization includes:
- ✅ Create all required tables (users, nas, profiles, accounting, etc.)
- ✅ Create default admin account (admin/toughradius)
- ✅ Initialize system configuration
- ✅ Create default NAS node

### Persistent Data

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data    # Database
  - toughradius_data:/data                    # Application data
```

Data persists across container restarts.

## RADIUS Configuration

### Standard RADIUS (RFC 2865/2866)

```yaml
radiusd:
  enabled: true
  host: 0.0.0.0
  auth_port: 1812      # Authentication port
  acct_port: 1813      # Accounting port
  debug: true
```

**Port Mapping** (docker-compose):
```yaml
ports:
  - "51812:1812/udp"   # RADIUS Auth (external:container)
  - "51813:1813/udp"   # RADIUS Acct
```

### RadSec (RADIUS over TLS/TCP)

RadSec port 2083 requires TLS certificates.

**Option 1: Disable RadSec (Development)**
```yaml
environment:
  - TOUGHRADIUS_RADIUS_RADSEC_PORT=0
```

**Option 2: Generate Certificates**
```bash
# Generate self-signed certificates
docker-compose exec toughradius toughradius -h | grep certgen

# Or manually:
mkdir -p /data/private
# Copy certificates to /data/private/:
#   - radsec.tls.crt
#   - radsec.tls.key
#   - toughradius.tls.crt
#   - toughradius.tls.key
```

## Customization

### Environment Variables

All configuration can be overridden via environment variables:

```yaml
environment:
  # System
  - TOUGHRADIUS_SYSTEM_WORKDIR=/data
  - TOUGHRADIUS_SYSTEM_DEBUG=false        # Production: false

  # Web
  - TOUGHRADIUS_WEB_HOST=0.0.0.0
  - TOUGHRADIUS_WEB_PORT=1816
  - TOUGHRADIUS_WEB_SECRET=your-secret    # Change this!

  # Database
  - TOUGHRADIUS_DB_TYPE=postgres
  - TOUGHRADIUS_DB_HOST=db
  - TOUGHRADIUS_DB_PORT=5432
  - TOUGHRADIUS_DB_NAME=toughradius
  - TOUGHRADIUS_DB_USER=postgres
  - TOUGHRADIUS_DB_PWD=secure-password    # Change this!

  # RADIUS
  - TOUGHRADIUS_RADIUS_ENABLED=true
  - TOUGHRADIUS_RADIUS_DEBUG=false        # Production: false
  - TOUGHRADIUS_RADIUS_AUTHPORT=1812
  - TOUGHRADIUS_RADIUS_ACCTPORT=1813
  - TOUGHRADIUS_RADIUS_RADSEC_PORT=2083   # Set to 0 to disable

  # Logger
  - TOUGHRADIUS_LOGGER_MODE=production    # development|production
  - TOUGHRADIUS_LOGGER_FILE_ENABLE=true
```

### Custom Configuration File

If you need advanced configuration, create a config file:

```bash
# Create custom config
docker run -v $(pwd):/data toughradius:latest \
  toughradius -c /data/toughradius.yml > toughradius.yml

# Edit configuration
vim toughradius.yml

# Mount into docker-compose
volumes:
  - ./toughradius.yml:/etc/toughradius.yml
```

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps db

# Check logs
docker-compose logs db

# Verify connectivity
docker-compose exec toughradius \
  psql -h db -U postgres -d toughradius -c "SELECT 1"
```

### Health Check Failing

```bash
# Check service endpoint
docker-compose exec toughradius curl -s http://localhost:1816/ready | jq .

# View logs
docker-compose logs toughradius | grep -i error
```

### Cannot Access Web Interface

```bash
# Check port binding
docker-compose ps
netstat -tlnp | grep 1816

# Test locally
docker-compose exec toughradius curl -s http://localhost:1816/ready
```

## Production Deployment Recommendations

### 1. Security

```yaml
environment:
  # Change these!
  - TOUGHRADIUS_WEB_SECRET=generate-random-secret
  - TOUGHRADIUS_DB_PWD=strong-database-password
  
  # Disable debug mode
  - TOUGHRADIUS_SYSTEM_DEBUG=false
  - TOUGHRADIUS_RADIUS_DEBUG=false
  - TOUGHRADIUS_LOGGER_MODE=production
```

### 2. Database Backup

```bash
# Backup PostgreSQL data
docker-compose exec db \
  pg_dump -U postgres toughradius > backup.sql

# Restore
docker-compose exec -T db \
  psql -U postgres toughradius < backup.sql
```

### 3. Scaling

For high-traffic environments:

```yaml
services:
  toughradius:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

### 4. Monitoring

```bash
# Check resource usage
docker-compose stats

# Monitor logs real-time
docker-compose logs -f toughradius

# Export metrics (if Prometheus enabled)
curl http://localhost:1816/metrics
```

## Upgrade

```bash
# Update code
git pull origin main

# Rebuild image
docker-compose build --no-cache

# Restart services
docker-compose up -d
```

Database schema automatically migrates on startup.

## Issues & Support

- 🐛 Report bugs: https://github.com/talkincode/toughradius/issues
- 📖 Documentation: https://github.com/talkincode/toughradius/wiki
- 💬 Discussions: https://github.com/talkincode/toughradius/discussions
