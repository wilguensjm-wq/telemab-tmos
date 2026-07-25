# TeleMab TV - Production Deployment Architecture & Migration Plan

**Version:** 1.0  
**Date:** 2026-07-25  
**Status:** Architecture & Migration Planning  
**Audience:** DevOps, Infrastructure, Engineering Leadership

---

## Executive Summary

TMOS (TeleMab Media Operations System) is currently in a **development architecture** with Tailscale VPN dependency for all external access. This document defines the production architecture required for TeleMab TV broadcast platform and provides a detailed migration path.

**Key Changes:**
- Remove VPN requirement for reporter access
- Implement public HTTPS endpoint: `https://reporter.telemab.com`
- Deploy Nginx Proxy Manager for TLS termination and routing
- Configure LiveKit with proper STUN/TURN for NAT traversal
- Reserve Tailscale for admin/maintenance access only
- Enable reporter browser-based access without additional software

---

## Current State Analysis

### Development Architecture (v0.2 Current)

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT SETUP                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Reporter (iPhone/Laptop)     Backend Infrastructure        │
│         │                              │                     │
│         ├─ Tailscale Required         ├─ PostgreSQL 5432    │
│         │  (VPN Overlay)              ├─ LiveKit 7880/7881  │
│         │                             ├─ Backend 8081       │
│         ├─ 100.116.180.23:5173        └─ Vite Dev 5173      │
│         │  Reporter Portal                                   │
│         │  (Unencrypted ws://)                              │
│         │                                                    │
│  Issues:                         Network:                    │
│  • VPN software required         • No TLS/HTTPS             │
│  • ws:// not wss://              • No STUN/TURN servers     │
│  • No STUN/TURN config           • No proxy termination     │
│  • Limited NAT traversal         • Localhost-only backend   │
│  • Dev credentials in code       • DHCP-assigned IP         │
│                                  • No DNS                    │
└─────────────────────────────────────────────────────────────┘
```

### Current Technology Stack

| Component | Current | Version | Issue |
|-----------|---------|---------|-------|
| **Frontend** | React (Vite) | 19.2.7 | Dev server only, no production build |
| **Backend** | Express.js | Latest | Runs on localhost:8081, no TLS |
| **Database** | PostgreSQL | 16 | Local Docker, no replication/backup |
| **LiveKit** | Container | Latest | ws://localhost:7880 (unencrypted) |
| **Proxy** | None | N/A | No TLS termination, no routing |
| **DNS** | None | N/A | IP-based access only |
| **TLS** | None | N/A | Complete absence of encryption |
| **VPN** | Tailscale | Active | Required for external access |
| **TURN Server** | None | N/A | No NAT traversal optimization |

### Frontend Deployment Method

```javascript
// frontend/src/constants/api.js
baseURL: import.meta.env.VITE_API_BASE_URL || "/api"

// frontend/vite.config.js
server: {
  host: '0.0.0.0',  // All interfaces
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8081',  // Localhost only
      changeOrigin: true
    }
  }
}
```

**Problem:** Vite dev server is NOT suitable for production. Browser imports directly from `/@vite/client`, HMR websocket not configured for HTTPS, etc.

### Backend Configuration

```bash
# backend/.env (DEVELOPMENT)
PORT=8081
NODE_ENV=production                    # ← Says "production" but runs unencrypted
TMOS_MEDIA_LIVEKIT_WS_URL=ws://100.116.180.23:7880  # ← Unencrypted WebSocket
TMOS_MEDIA_LIVEKIT_API_KEY=devkey      # ← Dev credentials
TMOS_MEDIA_LIVEKIT_API_SECRET=devsecret
```

**Problem:** Backend listens on `127.0.0.1:8081` only (localhost). No TLS. Dev credentials hardcoded.

### LiveKit Configuration

```yaml
# livekit.yaml (DEVELOPMENT)
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false              # ← Problem: No public IP for NAT traversal

keys:
  devkey: devsecret                    # ← Dev credentials
```

**Problem:** No STUN/TURN servers configured. No external IP advertisement means P2P connections will fail on restricted networks.

---

## Production Architecture Design

### Target Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              INTERNET                                        │
│                                 │                                            │
│                    ┌────────────┴────────────┐                               │
│                    │                         │                               │
│     ┌──────────────▼──────────────┐   ┌─────▼──────────────────┐            │
│     │  DNS (reporter.telemab.com) │   │  Reporter Client       │            │
│     │  Points to Load Balancer IP │   │  (Browser, iPhone)     │            │
│     └──────────────┬──────────────┘   │  • No VPN required     │            │
│                    │                   │  • wss:// encrypted    │            │
│                    │                   │  • STUN/TURN enabled   │            │
│                    ▼                   └───────────┬────────────┘            │
│     ┌──────────────────────────────────────────────────────────┐            │
│     │  NGINX Proxy Manager (Reverse Proxy)                    │            │
│     │  • TLS Termination (443)                                │            │
│     │  • Let's Encrypt SSL Certificates                       │            │
│     │  • Route to backend                                     │            │
│     │  • Handle /api/* → backend:8081                         │            │
│     │  • Handle / → frontend static                           │            │
│     └──┬───────────────────────────────────┬──────────────────┘            │
│        │                                   │                                 │
│        ▼                                   ▼                                 │
│     ┌─────────────────────────┐   ┌─────────────────────────┐              │
│     │  Backend (Express.js)   │   │  Frontend (React Build) │              │
│     │  • TLS via proxy        │   │  • Static HTML/JS/CSS   │              │
│     │  • :8081 (private)      │   │  • Served by Nginx      │              │
│     │  • PostgreSQL conn      │   │  • API calls via /api   │              │
│     │  • JWT auth             │   │  • Client-side routing  │              │
│     │  • RBAC enforcement     │   └─────────────────────────┘              │
│     │  • LiveKit server API   │                                             │
│     └──┬──────────────────────┘                                             │
│        │                                                                     │
│        ▼                                                                     │
│     ┌─────────────────────────────────────────┐                            │
│     │  PostgreSQL Database (Private)          │                            │
│     │  • Persistent data layer                │                            │
│     │  • RBAC, sessions, audit logs          │                            │
│     └─────────────────────────────────────────┘                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  LiveKit Media Server (Private)                         │               │
│  │  • wss:// encrypted WebSocket (from Nginx)             │               │
│  │  • STUN Servers (public IP resolution)                 │               │
│  │  • TURN Servers (NAT traversal relay)                  │               │
│  │  • RTC ports: 50000-60000 (public)                     │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  Tailscale VPN (Admin/Maintenance Only)                │               │
│  │  • Administrator SSH access to servers                 │               │
│  │  • Emergency maintenance console                       │               │
│  │  • NOT for reporter access                             │               │
│  └─────────────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Principles

1. **Public HTTPS Endpoint**: `https://reporter.telemab.com`
   - DNS controlled by organization
   - TLS certificate managed automatically
   - Single point of entry

2. **Reverse Proxy Pattern**:
   - Nginx Proxy Manager handles all external requests
   - Backend remains private (no external access)
   - Centralized TLS termination

3. **Backend over HTTPS**:
   - Backend reachable from Nginx via private network
   - Can optionally run on HTTPS for layered security
   - All external requests encrypted

4. **LiveKit Media Layer**:
   - Public RTC ports for media (UDP 50000-60000)
   - STUN/TURN for NAT traversal
   - Encrypted WebSocket (`wss://`) for control plane

5. **No VPN for Reporters**:
   - Public internet access sufficient
   - Reporter authenticates with username/password
   - Browser handles all UI/media

6. **Tailscale Reserved for Admin**:
   - SSH access for server management
   - Emergency maintenance console access
   - NOT exposed to reporters

---

## Component-by-Component Migration

### 1. DNS Configuration

**Current State:** IP-based access (192.168.88.244)  
**Required State:** DNS hostname

**Action Items:**

```bash
# Domain: reporter.telemab.com
# DNS Provider: (CloudFlare, Route53, etc.)
# Record Type: A (IPv4) or CNAME
# Points to: Load Balancer IP or Nginx Public IP

# Example (CloudFlare):
Type     Name              Content
A        reporter          203.0.113.42  (Nginx Public IP)
MX       @                 mail.telemab.com
TXT      @                 v=spf1 include:...
```

**Timeline:** 1-2 days (DNS propagation up to 48 hours)

---

### 2. Nginx Proxy Manager Deployment

**Current State:** None  
**Required State:** Deployed on public-facing server

**Deployment Strategy:**

**Option A: Standalone VM (Recommended)**
- Separate Ubuntu VM on public network
- Dedicated to TLS termination
- Isolation from backend infrastructure

**Option B: Docker Container (Quick)**
- Run as container on existing infrastructure
- Shares network with backend
- Simpler but less isolated

**Configuration Needed:**

```yaml
# Nginx Proxy Manager Docker Compose
version: '3'
services:
  npm:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'        # HTTP (for ACME challenge)
      - '443:443'      # HTTPS (public)
      - '81:81'        # Admin UI
    environment:
      DB_MYSQL_HOST: mysql
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: ${NPM_DB_PASS}
      DB_MYSQL_NAME: npm
    volumes:
      - npm_data:/data
      - npm_letsencrypt:/etc/letsencrypt
    networks:
      - npm
    depends_on:
      - mysql

  mysql:
    image: 'mysql:8'
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASS}
      MYSQL_DATABASE: npm
      MYSQL_USER: npm
      MYSQL_PASSWORD: ${NPM_DB_PASS}
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - npm

volumes:
  npm_data:
  npm_letsencrypt:
  mysql_data:

networks:
  npm:
```

**Nginx Proxy Rules:**

| Hostname | Port | Forward To | Notes |
|----------|------|-----------|-------|
| reporter.telemab.com | 443 | backend:8081 | Main API/Frontend |
| livekit.telemab.com | 443 | livekit:7881 | LiveKit HTTP API |

**Let's Encrypt Setup:**
- Automatic renewal (90-day certificates)
- ACME challenge via HTTP (port 80)
- Email notifications for renewal failures

**Timeline:** 2-3 days (setup, testing, certificate provisioning)

---

### 3. Frontend Production Build & Deployment

**Current State:** `npm run dev` (Vite dev server)  
**Required State:** Static production build served by Nginx

**Required Changes:**

#### 3a. Environment Configuration

```javascript
// frontend/.env.production
VITE_API_BASE_URL=https://reporter.telemab.com/api
VITE_API_MODE=live
VITE_SESSION_TIMEOUT_MS=1800000
```

#### 3b. Build Configuration (No Changes Required)

```bash
# frontend/vite.config.js is already compatible
# Remove dev server config for production:
export default defineConfig({
  plugins: [react()],
  // Remove 'server' config in production
  build: {
    outDir: 'dist',
    sourcemap: false,  // Disable for security
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
        }
      }
    }
  }
})
```

#### 3c. Build & Deployment Process

```bash
# Build frontend
cd frontend
npm ci
npm run build

# Output: frontend/dist/
# Contains: index.html, assets/*, etc.

# Copy to Nginx document root
cp -r dist/* /var/www/reporter.telemab.com/html/

# Nginx will serve these static files
```

#### 3d. Nginx Configuration for Frontend

```nginx
server {
    listen 443 ssl http2;
    server_name reporter.telemab.com;

    ssl_certificate /etc/letsencrypt/live/reporter.telemab.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reporter.telemab.com/privkey.pem;

    # Static files (React build)
    location / {
        root /var/www/reporter.telemab.com/html;
        try_files $uri $uri/ /index.html;  # SPA routing
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # API Proxy to Backend
    location /api/ {
        proxy_pass http://backend:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        
        # WebSocket support for presence gateway
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # LiveKit WebSocket
    location /livekit/ {
        proxy_pass http://livekit:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

**Timeline:** 1 day (build optimization, deployment testing)

---

### 4. Backend HTTPS Configuration

**Current State:** 
```
backend listening on http://127.0.0.1:8081
```

**Target State (Option A - Recommended):**
```
backend listening on http://0.0.0.0:8081 (private network)
Nginx handles all external TLS
```

**Target State (Option B - Layered Security):**
```
backend listening on https://0.0.0.0:8081 (with TLS)
Nginx also encrypts (defense in depth)
```

#### 4a. Backend Environment Update

```bash
# backend/.env (PRODUCTION)
PORT=8081
NODE_ENV=production
TMOS_DATABASE_URL=postgres://user:pass@postgres:5432/tmos

# Backend-to-proxy connectivity
# (If using Nginx routing, no change needed)
TMOS_BACKEND_PUBLIC_URL=https://reporter.telemab.com/api

# Proxy configuration for backend to reach external services
HTTP_PROXY=http://proxy.telemab.com:3128
HTTPS_PROXY=http://proxy.telemab.com:3128
NO_PROXY=localhost,127.0.0.1,backend,postgres,livekit
```

#### 4b. Backend Binding Change (If needed for layered security)

```javascript
// backend/src/server.js
// Add HTTPS support (optional, not required if Nginx handles it)

import https from 'https';
import fs from 'fs';

const httpsOptions = process.env.NODE_ENV === 'production' ? {
  key: fs.readFileSync('/etc/ssl/private/backend-key.pem'),
  cert: fs.readFileSync('/etc/ssl/certs/backend-cert.pem')
} : null;

const server = httpsOptions 
  ? https.createServer(httpsOptions, app)
  : http.createServer(app);
```

**Recommendation:** Skip backend TLS if Nginx is handling it (simpler, industry standard).

**Timeline:** 1 day (testing, environment setup)

---

### 5. LiveKit Production Configuration

**Current State:**
```yaml
port: 7880
rtc:
  use_external_ip: false  # ← Problem for NAT
```

**Required State:**

#### 5a. STUN Server Configuration

STUN (Session Traversal Utilities for NAT) allows clients to discover their public IP.

```yaml
# livekit.yaml (PRODUCTION)
rtc:
  port: 7880
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true              # ← Enable public IP advertisement
  
  stun_servers:
    - "stun:stun.l.google.com:19302"
    - "stun:stun1.l.google.com:19302"
    - "stun:stun2.l.google.com:19302"
    - "stun:stun3.l.google.com:19302"
    - "stun:stun4.l.google.com:19302"

# Optional: Self-hosted STUN server
#   - "stun:stun.telemab.com:3478"
```

#### 5b. TURN Server Configuration

TURN (Traversal Using Relays around NAT) provides media relay for clients that can't connect P2P.

**Option A: Third-Party TURN (Quick, Recommended for MVP)**

```yaml
rtc:
  turn_servers:
    - urls:
        - "turn:turn.telemab.com:3478"
        - "turn:turn.telemab.com:3478?transport=tcp"
        - "turns:turn.telemab.com:5349"
      username: "turnuser"
      credential: "turncredential"
```

**Service Providers:**
- Twilio TURN (turns.twilio.com)
- Google TURN (turn.google.com)
- Xirsys (xirsys.com)
- Metered.ca (free tier available)

**Option B: Self-Hosted TURN (coturn)**

```bash
# Install coturn on separate server
apt-get install coturn

# /etc/coturn/turnserver.conf
listening-port=3478
listening-ip=0.0.0.0
external-ip=203.0.113.100/203.0.113.100
realm=telemab.com
server-name=turn.telemab.com
user=reporter:turnpassword123
```

#### 5c. Nginx WebSocket Routing for LiveKit

```nginx
location /ws/ {
    proxy_pass http://livekit:7880;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

#### 5d. Backend LiveKit URL Configuration

```bash
# backend/.env (PRODUCTION)
# Old (development):
# TMOS_MEDIA_LIVEKIT_WS_URL=ws://100.116.180.23:7880

# New (production):
TMOS_MEDIA_LIVEKIT_WS_URL=wss://reporter.telemab.com/ws/
TMOS_MEDIA_LIVEKIT_API_KEY=prod-key-from-vault
TMOS_MEDIA_LIVEKIT_API_SECRET=prod-secret-from-vault
TMOS_MEDIA_LIVEKIT_TOKEN_TTL_SECONDS=3600
```

**Timeline:** 2-3 days (TURN server setup, testing, WebRTC optimization)

---

### 6. Database Migration & Hardening

**Current State:**
```
PostgreSQL in Docker
Default password (postgres:postgres)
Local socket access only
```

**Required State:**
```
PostgreSQL persistent (external volumes)
Strong credentials from secrets vault
Network isolation
Automated backups
```

#### 6a. PostgreSQL Docker Configuration

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tmos
      POSTGRES_USER: tmos_user
      POSTGRES_PASSWORD: ${PG_PASSWORD}  # From secrets manager
      POSTGRES_INITDB_ARGS: "-c ssl=on"
    ports:
      - "5432:5432"  # Keep private, don't expose
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-backups:/backups
    networks:
      - tmos
```

#### 6b. Secrets Management

```bash
# Use environment file from secrets manager (not version control)
# .env.production (EXCLUDED FROM GIT)

# Store in:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault

export SECRETS=$(aws secretsmanager get-secret-value --secret-id tmos/prod)
export POSTGRES_PASSWORD=$(echo $SECRETS | jq .SecretString.db_password)
export TMOS_JWT_SECRET=$(echo $SECRETS | jq .SecretString.jwt_secret)
```

#### 6c. Automated Backups

```bash
# Backup script
#!/bin/bash
BACKUP_DIR=/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec tmos-postgres pg_dump -U tmos_user tmos | \
  gzip > $BACKUP_DIR/tmos_$TIMESTAMP.sql.gz

# Retain 30 days of backups
find $BACKUP_DIR -name "tmos_*.sql.gz" -mtime +30 -delete

# Sync to S3
aws s3 sync $BACKUP_DIR s3://tmos-backups/postgres/
```

**Timeline:** 1-2 days (backup infrastructure, credential setup)

---

### 7. Authentication & Credentials

**Current State:**
```bash
TMOS_JWT_SECRET=replace-me
TMOS_ADMIN_USER=operator
TMOS_ADMIN_PASS=operator
TMOS_MEDIA_LIVEKIT_API_KEY=devkey
TMOS_MEDIA_LIVEKIT_API_SECRET=devsecret
```

**Required State:**

#### 7a. JWT Secret (Strong, Random)

```bash
# Generate production JWT secret
openssl rand -base64 32
# Output: AbCdEfGhIjKlMnOpQrStUvWxYz+/12345678

# Store in secrets manager
export TMOS_JWT_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz+/12345678
```

#### 7b. LiveKit Credentials (Production)

```bash
# Generate LiveKit API key/secret
# (From LiveKit admin console)
TMOS_MEDIA_LIVEKIT_API_KEY=prod-key-abc123def456
TMOS_MEDIA_LIVEKIT_API_SECRET=prod-secret-xyz789uvw012

# Or generate locally
LIVEKIT_API_KEY=$(openssl rand -hex 16)
LIVEKIT_API_SECRET=$(openssl rand -base64 32)
```

#### 7c. User Credentials

```bash
# Set strong admin credentials
TMOS_ADMIN_USER=admin_prod
TMOS_ADMIN_PASS=$(openssl rand -base64 32)

# Store in password manager
# Share securely with authorized personnel only
```

**Timeline:** 1 day (credential generation and secure distribution)

---

### 8. TLS Certificate Management

**Current State:** None

**Required State:**

#### 8a. Let's Encrypt (Automatic, Recommended)

```bash
# Nginx Proxy Manager handles this automatically
# Certificates auto-renew every 60 days
# Email notifications for renewal failures

# Manual renewal check
certbot renew --dry-run
```

#### 8b. Certificate Monitoring

```bash
# Monitor certificate expiry
echo "SELECT domain, valid_until FROM certificates;" | \
  mysql -h npm_mysql -u npm -p$NPM_DB_PASS npm

# Alert if expiring within 30 days
# (Nginx PM should handle this)
```

**Timeline:** Automated by Nginx Proxy Manager

---

## Detailed Migration Timeline

### Phase 1: Pre-Production Preparation (Weeks 1-2)

**Week 1:**

| Day | Task | Owner | Duration | Deliverable |
|-----|------|-------|----------|-------------|
| Mon-Tue | Domain registration & DNS setup | DevOps | 2 days | reporter.telemab.com pointing to test IP |
| Wed | Nginx Proxy Manager test deployment | DevOps | 1 day | NPM running on test VM, accessible |
| Thu-Fri | TLS certificate provisioning | DevOps | 2 days | Let's Encrypt cert validated |

**Week 2:**

| Day | Task | Owner | Duration | Deliverable |
|-----|------|-------|----------|-------------|
| Mon-Tue | Frontend production build setup | Frontend | 2 days | Build optimized, source maps disabled |
| Wed | Backend environment hardening | Backend | 1 day | Production .env created, secrets stored |
| Thu | LiveKit STUN/TURN configuration | DevOps | 1 day | livekit.yaml updated with servers |
| Fri | Load testing & performance baseline | QA | 1 day | Performance metrics established |

**Deliverables:**
- ✅ DNS records active
- ✅ TLS certificates provisioned
- ✅ Frontend production build process
- ✅ Backend configuration finalized
- ✅ LiveKit media servers configured

---

### Phase 2: Staging Deployment (Weeks 3-4)

**Week 3:**

| Day | Task | Owner | Duration | Deliverable |
|-----|------|-------|----------|-------------|
| Mon-Tue | Deploy full stack to staging | DevOps | 2 days | Staging environment running on reporter-staging.telemab.com |
| Wed-Thu | Integration testing | QA/Dev | 2 days | All tests passing, no regressions |
| Fri | Performance testing | QA | 1 day | Performance within SLA |

**Week 4:**

| Day | Task | Owner | Duration | Deliverable |
|-----|------|-------|----------|-------------|
| Mon-Tue | Security audit & penetration testing | Security | 2 days | Security report, vulnerabilities addressed |
| Wed-Thu | Backup & disaster recovery testing | DevOps | 2 days | Recovery time objective (RTO) < 1 hour validated |
| Fri | User acceptance testing (UAT) | Product | 1 day | UAT passed, sign-off obtained |

**Deliverables:**
- ✅ Staging environment fully operational
- ✅ All automated tests passing
- ✅ Performance SLA met
- ✅ Security audit completed
- ✅ Disaster recovery plan tested

---

### Phase 3: Production Deployment (Week 5)

**Week 5:**

| Day | Task | Owner | Duration | Deliverable |
|-----|------|-------|----------|-------------|
| Mon 9am-12pm | Production infrastructure readiness | DevOps | 3 hours | All systems go/no-go check |
| Mon 12pm-2pm | Deploy to production | DevOps | 2 hours | Production running, all health checks pass |
| Mon 2pm-5pm | Smoke testing & validation | QA | 3 hours | Core functionality verified |
| Tue-Wed | Monitor & support (intensive) | Ops | 2 days | No critical issues, SLA met |
| Thu-Fri | Gradual traffic migration | Product | 2 days | 100% of users on production |

**Deliverables:**
- ✅ Production deployment complete
- ✅ Zero downtime migration
- ✅ All systems operating within SLA

---

## Architecture Diagrams & Network Maps

### Production Network Topology

```
┌────────────────────────────────────────────────────────────────────┐
│                         INTERNET / DNS                             │
│                     reporter.telemab.com                           │
└────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼───────────┐  ┌────▼──────────────────┐
         │  DNS Failover #1    │  │  DNS Failover #2      │
         │  (Load Balancer 1)  │  │  (Load Balancer 2)    │
         │  203.0.113.42       │  │  203.0.113.43         │
         └──────────┬───────────┘  └────┬──────────────────┘
                    │                   │
         ┌──────────┴───────────┐  ┌────┴──────────────────┐
         │                      │  │                       │
    ┌────▼────────────────┐  ┌─▼──▼──────────────────┐
    │  Nginx Proxy Mgr #1 │  │  Nginx Proxy Mgr #2   │
    │  (TLS Termination)  │  │  (TLS Termination)    │
    │  Public: 443        │  │  Public: 443          │
    │  Admin: 81          │  │  Admin: 81            │
    └────┬─────────────────┘  └──┬───────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────────────┐
         │   PRIVATE BACKEND NETWORK     │
         │   (Docker Compose Network)    │
         │                               │
         ├─ Reporter.telemab.com:8081    │
         │  (Backend Container)          │
         │  • Express.js                 │
         │  • RBAC Auth                  │
         │  • LiveKit Client API         │
         │                               │
         ├─ livekit.telemab.com:7880     │
         │  (LiveKit Container)          │
         │  • WebRTC SFU                 │
         │  • STUN/TURN configured       │
         │  • Media bridging             │
         │                               │
         ├─ postgres:5432                │
         │  (PostgreSQL Database)        │
         │  • User data                  │
         │  • Sessions                   │
         │  • Audit logs                 │
         │                               │
         ├─ npm_mysql:3306               │
         │  (Nginx PM Database)          │
         │  • Proxy configs              │
         │  • SSL certificates           │
         │                               │
         └─ redis:6379 (Optional)        │
            (Session cache)              │
            • JWT blacklist              │
            • Rate limiting              │
│
└───────────────────────────────────────┘

PUBLIC RTC LAYER (UDP 50000-60000)
├─ Reporter Client ◄──► LiveKit RTC Port
├─ STUN Packets    ──► stun.l.google.com:19302
└─ TURN Relay      ──► turn.telemab.com:3478

ADMIN ACCESS (Tailscale Only)
├─ SSH to any container (port 22 via Tailscale)
├─ Nginx Admin Console (100.116.180.x:81)
└─ Database Admin Tools (DBeaver via Tailscale)
```

---

## Infrastructure Requirements

### Hardware/Cloud Resources

| Component | Spec | Reasoning |
|-----------|------|-----------|
| **Nginx Proxy Manager** | 2 vCPU, 4GB RAM, 50GB SSD | TLS termination, static file serving |
| **Backend Server** | 4 vCPU, 8GB RAM, 100GB SSD | Node.js app, RBAC checks, LiveKit API calls |
| **LiveKit Server** | 8 vCPU, 16GB RAM, 200GB SSD | Media bridging, RTC mixing |
| **PostgreSQL Server** | 4 vCPU, 16GB RAM, 500GB SSD | Persistent data, RBAC, audit logs |
| **Total** | ~18 vCPU, ~44GB RAM, ~850GB SSD | Supports 100+ concurrent reporters |

### Cloud Provider Options

| Provider | Service | Cost/mo | Notes |
|----------|---------|---------|-------|
| **AWS** | EC2 + RDS | ~$500-800 | Auto-scaling, S3 backups |
| **DigitalOcean** | Droplets + Managed DB | ~$300-500 | Simple, predictable pricing |
| **Azure** | VMs + PostgreSQL DB | ~$400-600 | Enterprise support |
| **Hetzner** | Dedicated Server | ~$200-400 | Most cost-effective |
| **Linode** | Instances + Managed DB | ~$350-550 | Reliable, good API |

**Recommendation:** DigitalOcean or Hetzner for cost-effectiveness, AWS for auto-scaling capability.

---

## Monitoring & Observability

### Production Monitoring Stack

```
Application Monitoring:
├─ Prometheus (metrics collection)
├─ Grafana (dashboards)
└─ AlertManager (alerting)

Logging:
├─ ELK Stack (Elasticsearch, Logstash, Kibana)
├─ Papertrail (SaaS logging)
└─ CloudWatch (AWS-native)

Uptime Monitoring:
├─ Uptime Kuma (internal)
├─ StatusPage.io (public status)
└─ PagerDuty (incident response)

Application Performance Monitoring (APM):
├─ New Relic
├─ Datadog
└─ Elastic APM
```

### Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **API Response Time** | <200ms p95 | >500ms |
| **LiveKit Connection Success** | >99.5% | <98% |
| **Database Query Time** | <50ms p95 | >200ms |
| **CPU Usage** | <60% average | >80% |
| **Memory Usage** | <75% average | >90% |
| **Disk Space** | >20% free | <10% free |
| **TLS Certificate Expiry** | 30+ days remaining | <14 days |
| **Backup Success Rate** | 100% | <95% |

---

## Cost Analysis

### Monthly Operating Costs

| Component | Unit Cost | Quantity | Total/mo |
|-----------|-----------|----------|----------|
| **Cloud Infrastructure** | - | - | **$400-600** |
| Nginx Proxy Manager VM | $20/mo | 1 | $20 |
| Backend Server | $50/mo | 2 | $100 |
| LiveKit Server | $100/mo | 1 | $100 |
| PostgreSQL (Managed) | $75/mo | 1 | $75 |
| Load Balancer | $20/mo | 1 | $20 |
| Backup Storage (S3/Backblaze) | $10/mo | - | $10 |
| CDN (Optional, CloudFront) | $0.085/GB | 100GB | $8.50 |
| Monitoring (SaaS) | $50/mo | 1 | $50 |
| TURN Server (Metered) | $0.005/min | 1000hrs | $300 |
| SSL Certificates | $0/mo | 1 | $0 (Let's Encrypt free) |
| DNS | $0.50/mo | - | $0.50 |
| **Subtotal Infrastructure** | - | - | **$683.50** |
| **Team & Support** | - | - | **$3000-5000** |
| 0.5 DevOps FTE | $60/hr | 80 hrs | $4800 |
| **Total Monthly** | - | - | **$3683.50 - $5683.50** |

### Cost Optimization

1. **Use Reserved Instances:** 30-40% savings on compute
2. **Auto-scaling:** Scale down outside peak hours
3. **Regional Optimization:** Use cheaper regions if latency allows
4. **TURN Server Optimization:** Self-hosted coturn (~$100/mo vs. $300/mo SaaS)
5. **Shared Services:** Combine databases across projects

---

## Rollback & Disaster Recovery Plan

### Rollback Procedure (If Critical Issues)

```bash
# 1. Immediately pause traffic to new production
# (Nginx Proxy Manager → point back to staging)

# 2. Restore database from backup
docker exec tmos-postgres pg_restore \
  -U tmos_user -d tmos \
  /backups/tmos_pre_migration.sql.gz

# 3. Restart backend with previous version
cd /opt/tmos && git checkout v0.2.0
docker-compose restart backend

# 4. Monitor for stability (30 minutes)
# 5. If stable, run full diagnostics
# 6. Document incident
```

**RTO (Recovery Time Objective):** < 15 minutes  
**RPO (Recovery Point Objective):** < 1 hour

### Disaster Recovery Runbook

```
INCIDENT: Production Database Corruption

Step 1: Detect (Automated alerts)
  - PostgreSQL health check failed
  - Backup integrity check failed

Step 2: Assess (2 minutes)
  - Check database logs
  - Determine scope of corruption
  - Decision: Restore vs. Failover

Step 3: Execute Restore (5 minutes)
  - Stop backend services
  - Restore from hourly backup
  - Verify data integrity
  - Restart backend
  - Run smoke tests

Step 4: Validate (5 minutes)
  - Test critical flows
  - Check data consistency
  - Monitor metrics

Step 5: Communicate (Ongoing)
  - Notify support team
  - Update status page
  - Post-incident review (24 hrs)
```

---

## Security Checklist

- [ ] TLS certificates auto-renewed
- [ ] Database credentials in secrets manager
- [ ] JWT secrets rotated regularly
- [ ] RBAC permission mappings up-to-date
- [ ] API rate limiting configured
- [ ] CORS properly restricted
- [ ] SQL injection protections (parameterized queries)
- [ ] XSS protections (CSP headers)
- [ ] CSRF tokens enabled
- [ ] Authentication audit logging enabled
- [ ] Firewall rules restrict backend access
- [ ] SSH key-based auth only (no passwords)
- [ ] Admin console behind VPN (Tailscale)
- [ ] Backup encryption enabled
- [ ] Security headers set (HSTS, X-Frame-Options, etc.)

---

## Deployment Checklist

### Pre-Deployment (48 hours before)

- [ ] All staging tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Disaster recovery tested
- [ ] Rollback plan documented
- [ ] On-call engineer assigned
- [ ] Stakeholders notified
- [ ] Incident communication template prepared

### Deployment Day

- [ ] Health checks passing
- [ ] Backups verified
- [ ] Secrets loaded correctly
- [ ] Nginx proxy manager ready
- [ ] DNS records verified
- [ ] Load balancer ready
- [ ] Monitoring alerts active
- [ ] Logging pipeline flowing

### Post-Deployment

- [ ] Critical reporter flows tested
- [ ] Camera/microphone working
- [ ] LiveKit connection stable
- [ ] Database replication verified
- [ ] Backups running
- [ ] Metrics within SLA
- [ ] No ERROR logs
- [ ] Status page updated

---

## Known Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| TLS cert expiry | Service outage | Low | Auto-renewal, 30-day alerts |
| Database failure | Data loss | Low | Replication, hourly backups |
| LiveKit server crash | Reporters offline | Medium | Auto-restart, health checks |
| DDoS attack | Service unavailable | Medium | CloudFlare, rate limiting |
| Network partition | Sync failures | Low | Automatic failover, queuing |
| Credential leak | Security breach | Low | Secrets rotation, audit logs |

---

## Success Criteria

**Technical Success:**
- ✅ Zero-downtime deployment
- ✅ All tests passing (unit, integration, E2E)
- ✅ Performance within SLA (p95 < 200ms)
- ✅ Availability > 99.5%
- ✅ Zero data loss

**User Success:**
- ✅ Reporters can join without VPN
- ✅ Camera/microphone work reliably
- ✅ HTTPS secure connection
- ✅ <100ms latency to LiveKit
- ✅ Smooth WebRTC connections

**Operational Success:**
- ✅ Monitoring alerts functional
- ✅ Backup/restore tested
- ✅ Runbooks documented
- ✅ Team trained
- ✅ Incident response tested

---

## Next Steps

1. **Week 1:**
   - [ ] Register domain (reporter.telemab.com)
   - [ ] Provision cloud infrastructure
   - [ ] Create environment variables document
   - [ ] Set up secrets manager account

2. **Week 2:**
   - [ ] Deploy Nginx Proxy Manager
   - [ ] Provision TLS certificates
   - [ ] Build and test production frontend
   - [ ] Update backend configuration

3. **Week 3:**
   - [ ] Full stack deployment to staging
   - [ ] Comprehensive testing
   - [ ] Security audit
   - [ ] Performance validation

4. **Week 4:**
   - [ ] Production deployment
   - [ ] Monitoring & alerting
   - [ ] Team training
   - [ ] Documentation finalization

5. **Week 5:**
   - [ ] Monitor production metrics
   - [ ] Gradual user migration
   - [ ] Optimize performance
   - [ ] Incident response drills

---

## Appendix: Configuration Files

### A. Nginx Proxy Manager Rules

```
Host: reporter.telemab.com:443
SSL: Let's Encrypt
Forward Hostname: backend:8081
Forward Protocol: HTTP

Access List:
- Deny non-HTTPS traffic
- Enforce HTTPS redirect
```

### B. Backend .env (Production Template)

```bash
# Server
PORT=8081
NODE_ENV=production
LOG_LEVEL=info

# Database
TMOS_DATABASE_URL=postgres://tmos_user:${PG_PASSWORD}@postgres:5432/tmos
TMOS_DATABASE_SSL=true
TMOS_DATABASE_MAX_POOL_SIZE=10

# Auth
TMOS_JWT_SECRET=${JWT_SECRET}
TMOS_JWT_TTL=3600
TMOS_SESSION_TTL=86400
TMOS_REFRESH_TOKEN_TTL=604800

# Admin User
TMOS_ADMIN_USER=admin_prod
TMOS_ADMIN_PASS=${ADMIN_PASSWORD}

# LiveKit
TMOS_MEDIA_LIVEKIT_ENABLED=true
TMOS_MEDIA_LIVEKIT_WS_URL=wss://reporter.telemab.com/ws/
TMOS_MEDIA_LIVEKIT_API_URL=http://livekit:7881
TMOS_MEDIA_LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
TMOS_MEDIA_LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
TMOS_MEDIA_LIVEKIT_TOKEN_TTL_SECONDS=3600

# Proxmox Integration
PROXMOX_ENABLED=false  # Disable in production unless needed
PROXMOX_TLS_STRICT=true

# CORS
CORS_ORIGIN=https://reporter.telemab.com

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
METRICS_ENABLED=true
PROMETHEUS_PORT=9090
```

### C. livekit.yaml (Production)

```yaml
port: 7880
bind_addresses:
  - "0.0.0.0"

rtc:
  port: 7880
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  
  stun_servers:
    - "stun:stun.l.google.com:19302"
    - "stun:stun1.l.google.com:19302"
    - "stun:stun2.l.google.com:19302"
    - "stun:stun3.l.google.com:19302"
    - "stun:stun4.l.google.com:19302"
  
  turn_servers:
    - urls:
        - "turn:turn.metered.ca:80"
        - "turn:turn.metered.ca:443"
      username: "${TURN_USERNAME}"
      credential: "${TURN_PASSWORD}"

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 100

keys:
  "${LIVEKIT_API_KEY}": "${LIVEKIT_API_SECRET}"

logging:
  level: info
  json: true

webhook:
  api_key: "${LIVEKIT_WEBHOOK_KEY}"
  urls:
    - "https://reporter.telemab.com/api/v1/webhooks/livekit"
```

---

**Document Complete**

This production deployment architecture document provides a complete blueprint for migrating TeleMab TV from development to enterprise-ready production deployment. Implementation can proceed with this specification as the reference architecture.
