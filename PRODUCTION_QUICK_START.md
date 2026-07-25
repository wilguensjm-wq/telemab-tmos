# Production Deployment - Quick Start Implementation Guide

**Status:** Copy-paste ready configurations  
**Target:** First production deployment  

---

## 1. Environment Files (Copy & Modify)

### backend/.env.production

```bash
# ============================================
# PRODUCTION BACKEND CONFIGURATION
# ============================================

# Server Configuration
PORT=8081
NODE_ENV=production
LOG_LEVEL=info

# ============================================
# DATABASE (PostgreSQL)
# ============================================
TMOS_DATABASE_URL=postgres://tmos_user:YOUR_PG_PASSWORD@postgres:5432/tmos
TMOS_DATABASE_SSL=true
TMOS_DATABASE_MAX_POOL_SIZE=10
TMOS_DATABASE_REQUIRED=true

# ============================================
# AUTHENTICATION & SECURITY
# ============================================
TMOS_JWT_SECRET=YOUR_RANDOM_JWT_SECRET_HERE
TMOS_JWT_TTL=3600
TMOS_SESSION_TTL=86400
TMOS_REFRESH_TOKEN_TTL=604800

# Admin User (Set strong password!)
TMOS_ADMIN_USER=admin_prod
TMOS_ADMIN_PASS=YOUR_STRONG_ADMIN_PASSWORD

# ============================================
# LIVEKIT CONFIGURATION
# ============================================
TMOS_MEDIA_LIVEKIT_ENABLED=true
TMOS_MEDIA_LIVEKIT_WS_URL=wss://reporter.telemab.com/ws/
TMOS_MEDIA_LIVEKIT_API_URL=http://livekit:7881
TMOS_MEDIA_LIVEKIT_API_KEY=YOUR_PRODUCTION_LIVEKIT_API_KEY
TMOS_MEDIA_LIVEKIT_API_SECRET=YOUR_PRODUCTION_LIVEKIT_API_SECRET
TMOS_MEDIA_LIVEKIT_TOKEN_TTL_SECONDS=3600

# ============================================
# PROXMOX (Disable in production)
# ============================================
PROXMOX_ENABLED=false

# ============================================
# CORS & SECURITY
# ============================================
CORS_ORIGIN=https://reporter.telemab.com
CORS_CREDENTIALS=true

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# MONITORING & METRICS
# ============================================
METRICS_ENABLED=true
PROMETHEUS_PORT=9090
```

**How to use:**
```bash
# Replace all YOUR_* placeholders with actual values
# Generate strong secrets:
openssl rand -base64 32  # for JWT_SECRET
openssl rand -hex 16     # for API_KEY
openssl rand -base64 32  # for API_SECRET

# Save as backend/.env.production (NOT in git)
# Never commit this file!
```

---

### frontend/.env.production

```bash
# ============================================
# PRODUCTION FRONTEND CONFIGURATION
# ============================================

# API Configuration
VITE_API_BASE_URL=https://reporter.telemab.com/api
VITE_API_MODE=live
VITE_API_TIMEOUT=10000

# Session Management
VITE_SESSION_TIMEOUT_MS=1800000

# Development Bypass (MUST be false in production!)
TMOS_DEV_AUTH_BYPASS=false

# Logging
VITE_LOG_LEVEL=warn

# Build Optimization (no dev tools in production)
VITE_INLINE_SVGS=true
```

---

### livekit.yaml (Production)

```yaml
# ============================================
# LIVEKIT PRODUCTION CONFIGURATION
# ============================================

port: 7880
bind_addresses:
  - "0.0.0.0"

logging:
  level: info
  json: true

rtc:
  port: 7880
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true                    # CRITICAL: Must be true for NAT
  use_external_ip_for_loopback: false
  
  # STUN Servers (free, public)
  stun_servers:
    - "stun:stun.l.google.com:19302"
    - "stun:stun1.l.google.com:19302"
    - "stun:stun2.l.google.com:19302"
    - "stun:stun3.l.google.com:19302"
    - "stun:stun4.l.google.com:19302"
  
  # TURN Servers (relay for restrictive networks)
  turn_servers:
    - urls:
        - "turn:turn.metered.ca:80?transport=udp"
        - "turn:turn.metered.ca:80?transport=tcp"
        - "turns:turn.metered.ca:443?transport=tcp"
      username: "YOUR_TURN_USERNAME"
      credential: "YOUR_TURN_PASSWORD"
      credential_type: "password"

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 100

keys:
  "YOUR_PRODUCTION_LIVEKIT_API_KEY": "YOUR_PRODUCTION_LIVEKIT_API_SECRET"

webhook:
  api_key: "YOUR_LIVEKIT_WEBHOOK_KEY"
  urls:
    - "https://reporter.telemab.com/api/v1/webhooks/livekit"

  # Graceful shutdown
  drain_timeout: 5
```

---

## 2. Docker Compose Configuration (Production)

### docker-compose.production.yml

```yaml
version: '3.8'

services:
  # ========================================
  # PostgreSQL Database
  # ========================================
  postgres:
    image: postgres:16-alpine
    container_name: tmos-postgres
    restart: always
    environment:
      POSTGRES_DB: tmos
      POSTGRES_USER: tmos_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-c ssl=on"
    ports:
      - "127.0.0.1:5432:5432"  # Localhost only
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-backups:/backups
      - ./postgresql.conf:/etc/postgresql/postgresql.conf:ro
    networks:
      - tmos
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tmos_user -d tmos"]
      interval: 10s
      timeout: 5s
      retries: 10
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # ========================================
  # LiveKit Media Server
  # ========================================
  livekit:
    image: livekit/livekit-server:latest
    container_name: tmos-livekit
    restart: always
    ports:
      - "127.0.0.1:7880:7880"    # WebSocket (internal, proxied)
      - "127.0.0.1:7881:7881"    # HTTP API (internal)
      - "127.0.0.1:7882:7882"    # Prometheus metrics (internal)
      - "50000-60000:50000-60000/udp"  # RTC media (public)
    environment:
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - LIVEKIT_LOG_LEVEL=info
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    networks:
      - tmos
    command: --config /etc/livekit.yaml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7881/health"]
      interval: 10s
      timeout: 5s
      retries: 10
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  # ========================================
  # Backend API Server
  # ========================================
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: tmos-backend
    restart: always
    depends_on:
      postgres:
        condition: service_healthy
      livekit:
        condition: service_healthy
    ports:
      - "127.0.0.1:8081:8081"  # Localhost only (proxied by Nginx)
    environment:
      - NODE_ENV=production
      - PORT=8081
      - TMOS_DATABASE_URL=postgres://tmos_user:${POSTGRES_PASSWORD}@postgres:5432/tmos
      - TMOS_JWT_SECRET=${JWT_SECRET}
      - TMOS_ADMIN_USER=admin_prod
      - TMOS_ADMIN_PASS=${ADMIN_PASSWORD}
      - TMOS_MEDIA_LIVEKIT_ENABLED=true
      - TMOS_MEDIA_LIVEKIT_WS_URL=wss://reporter.telemab.com/ws/
      - TMOS_MEDIA_LIVEKIT_API_URL=http://livekit:7881
      - TMOS_MEDIA_LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - TMOS_MEDIA_LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - CORS_ORIGIN=https://reporter.telemab.com
      - RATE_LIMIT_ENABLED=true
      - METRICS_ENABLED=true
    volumes:
      - ./backend/logs:/app/logs
    networks:
      - tmos
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 10
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "10"

volumes:
  postgres_data:
    driver: local

networks:
  tmos:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

---

## 3. Nginx Proxy Manager Setup

### Nginx Proxy Manager Docker Compose

```yaml
version: '3'
services:
  npm:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: npm-server
    restart: unless-stopped
    ports:
      - '80:80'        # HTTP (for Let's Encrypt ACME)
      - '443:443'      # HTTPS (production)
      - '81:81'        # Admin UI (private)
    environment:
      DB_MYSQL_HOST: npm_mysql
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: ${NPM_DB_PASSWORD}
      DB_MYSQL_NAME: npm
    volumes:
      - npm_data:/data
      - npm_letsencrypt:/etc/letsencrypt
    networks:
      - npm
      - tmos  # Connect to backend network
    depends_on:
      - npm_mysql
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  npm_mysql:
    image: 'mysql:8'
    container_name: npm_mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: npm
      MYSQL_USER: npm
      MYSQL_PASSWORD: ${NPM_DB_PASSWORD}
    volumes:
      - npm_mysql_data:/var/lib/mysql
    networks:
      - npm
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  npm_data:
  npm_letsencrypt:
  npm_mysql_data:

networks:
  npm:
    driver: bridge
  tmos:
    external: true  # Connect to backend network
```

---

## 4. Nginx Proxy Rules (Configure in NPM Admin UI)

### Proxy Host 1: Main Application

```
Details:
  Domain Names: reporter.telemab.com
  Scheme: http
  Forward Hostname/IP: backend
  Forward Port: 8081
  Cache Assets: Yes

SSL:
  SSL Certificate: Let's Encrypt
  Force SSL: Yes
  HSTS Enabled: Yes
  HSTS Subdomains: Yes

Advanced:
  Websockets Support: Yes
  Block Common Exploits: Yes
  Deny Common Locations: Yes
```

### Proxy Host 2: LiveKit API (Optional)

```
Details:
  Domain Names: livekit.telemab.com (or via same domain at /livekit/)
  Scheme: http
  Forward Hostname/IP: livekit
  Forward Port: 7881
  Cache Assets: No

SSL:
  SSL Certificate: Let's Encrypt
  Force SSL: Yes

Advanced:
  Websockets Support: Yes
  Block Common Exploits: Yes
```

---

## 5. Deployment Commands

### Script 1: Build & Tag

```bash
#!/bin/bash
set -e

DOCKER_REGISTRY="your-registry.azurecr.io"
VERSION=$(date +%Y%m%d_%H%M%S)

echo "Building backend..."
docker build -t $DOCKER_REGISTRY/tmos-backend:$VERSION ./backend
docker push $DOCKER_REGISTRY/tmos-backend:$VERSION
docker tag $DOCKER_REGISTRY/tmos-backend:$VERSION $DOCKER_REGISTRY/tmos-backend:latest
docker push $DOCKER_REGISTRY/tmos-backend:latest

echo "Building frontend..."
cd frontend
npm ci
npm run build
docker build -t $DOCKER_REGISTRY/tmos-frontend:$VERSION .
docker push $DOCKER_REGISTRY/tmos-frontend:$VERSION
docker tag $DOCKER_REGISTRY/tmos-frontend:$VERSION $DOCKER_REGISTRY/tmos-frontend:latest
docker push $DOCKER_REGISTRY/tmos-frontend:latest

echo "Version: $VERSION"
echo "Pushed to registry"
```

### Script 2: Deploy to Production

```bash
#!/bin/bash
set -e

ENVIRONMENT=production
BACKUP_DIR=/backups/pre-deployment

echo "=== PRODUCTION DEPLOYMENT ==="
echo "Environment: $ENVIRONMENT"
echo "Time: $(date)"

# 1. Backup database
echo "Creating database backup..."
docker exec tmos-postgres pg_dump -U tmos_user tmos | gzip > $BACKUP_DIR/tmos_$(date +%Y%m%d_%H%M%S).sql.gz

# 2. Load environment
echo "Loading production environment..."
source .env.production

# 3. Pull latest images
echo "Pulling latest Docker images..."
docker-compose -f docker-compose.production.yml pull

# 4. Stop old services gracefully
echo "Stopping services..."
docker-compose -f docker-compose.production.yml down --timeout 30

# 5. Run migrations
echo "Running database migrations..."
docker-compose -f docker-compose.production.yml run --rm backend npm run migrate

# 6. Start new services
echo "Starting services..."
docker-compose -f docker-compose.production.yml up -d

# 7. Wait for health checks
echo "Waiting for services to become healthy..."
for i in {1..30}; do
  if curl -f http://localhost:8081/api/v1/health > /dev/null 2>&1; then
    echo "✅ Backend healthy"
    break
  fi
  echo "Waiting... ($i/30)"
  sleep 2
done

if ! curl -f http://localhost:8081/api/v1/health > /dev/null 2>&1; then
  echo "❌ Backend health check failed!"
  exit 1
fi

# 8. Verify deployment
echo "Verifying deployment..."
REPORTER_STATUS=$(curl -s http://localhost:8081/api/v1/health | jq .status)
echo "Reporter Status: $REPORTER_STATUS"

if [ "$REPORTER_STATUS" = '"success"' ]; then
  echo "✅ DEPLOYMENT SUCCESSFUL"
  echo "URL: https://reporter.telemab.com"
else
  echo "❌ DEPLOYMENT VERIFICATION FAILED"
  exit 1
fi
```

### Script 3: Backup & Restore

```bash
#!/bin/bash

# Backup function
backup() {
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE=/backups/tmos_$TIMESTAMP.sql.gz
  
  echo "Creating backup: $BACKUP_FILE"
  docker exec tmos-postgres pg_dump -U tmos_user tmos | gzip > $BACKUP_FILE
  
  # Upload to S3
  aws s3 cp $BACKUP_FILE s3://tmos-backups/postgres/
  
  echo "✅ Backup complete"
  echo "File: $BACKUP_FILE"
}

# Restore function
restore() {
  BACKUP_FILE=$1
  
  if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 restore <backup_file>"
    exit 1
  fi
  
  echo "Restoring from: $BACKUP_FILE"
  
  # Stop backend
  docker-compose -f docker-compose.production.yml stop backend
  
  # Restore database
  gunzip < $BACKUP_FILE | docker exec -i tmos-postgres psql -U tmos_user tmos
  
  # Start backend
  docker-compose -f docker-compose.production.yml start backend
  
  echo "✅ Restore complete"
}

case "$1" in
  backup) backup ;;
  restore) restore "$2" ;;
  *) echo "Usage: $0 {backup|restore}" ;;
esac
```

---

## 6. Health Check & Monitoring

### Health Check Script

```bash
#!/bin/bash

echo "=== TeleMab TV Health Check ==="
echo "Time: $(date)"

# Check backend
echo -n "Backend API: "
if curl -f http://localhost:8081/api/v1/health > /dev/null 2>&1; then
  echo "✅ UP"
else
  echo "❌ DOWN"
fi

# Check LiveKit
echo -n "LiveKit: "
if curl -f http://localhost:7881/health > /dev/null 2>&1; then
  echo "✅ UP"
else
  echo "❌ DOWN"
fi

# Check Database
echo -n "PostgreSQL: "
if docker exec tmos-postgres pg_isready -U tmos_user -d tmos > /dev/null 2>&1; then
  echo "✅ UP"
else
  echo "❌ DOWN"
fi

# Check Nginx Proxy Manager
echo -n "Nginx Proxy Manager: "
if curl -f http://localhost:81 > /dev/null 2>&1; then
  echo "✅ UP"
else
  echo "❌ DOWN"
fi

# Check HTTPS
echo -n "HTTPS Endpoint: "
if curl -f https://reporter.telemab.com > /dev/null 2>&1; then
  echo "✅ UP"
else
  echo "❌ DOWN (May fail if not yet deployed)"
fi

echo ""
echo "=== System Metrics ==="
docker stats --no-stream

echo ""
echo "=== Disk Space ==="
df -h

echo ""
echo "Health check complete"
```

---

## 7. Emergency Rollback

```bash
#!/bin/bash

echo "=== EMERGENCY ROLLBACK ==="

# Stop production
docker-compose -f docker-compose.production.yml down

# Restore from backup
LATEST_BACKUP=$(ls -t /backups/tmos_*.sql.gz | head -1)
echo "Restoring from: $LATEST_BACKUP"
gunzip < $LATEST_BACKUP | docker exec -i tmos-postgres psql -U tmos_user tmos

# Restart services
docker-compose -f docker-compose.production.yml up -d

# Wait and verify
sleep 10
curl -f http://localhost:8081/api/v1/health

echo "Rollback complete"
```

---

## Implementation Checklist

### Pre-Deployment

- [ ] DNS records pointing to load balancer
- [ ] Environment files created (not in git!)
- [ ] Secrets loaded into vault/manager
- [ ] Database backups tested
- [ ] SSL certificates provisioned
- [ ] Load balancer/Nginx configured
- [ ] Health checks passing on staging
- [ ] Performance tests successful
- [ ] Security audit completed

### Deployment Day

- [ ] All team members notified
- [ ] Incident response team on standby
- [ ] Monitoring dashboard open
- [ ] Runbooks printed/accessible
- [ ] Backups recent and verified
- [ ] Rollback procedure tested

### Post-Deployment

- [ ] Health checks passing (all systems)
- [ ] Reporter portal accessible
- [ ] Camera/microphone working
- [ ] LiveKit connections stable
- [ ] Database replication verified
- [ ] Monitoring alerts configured
- [ ] Status page updated
- [ ] Team debriefing scheduled

---

**Ready to deploy!**

Copy these configurations, customize them for your environment, and follow the deployment scripts step-by-step.

Contact DevOps team for questions about credentials or secrets management.
