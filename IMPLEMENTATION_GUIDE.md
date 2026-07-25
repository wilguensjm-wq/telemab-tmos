# TeleMab Broadcast Platform - Implementation Phase

This monorepo contains the complete implementation of the TeleMab Broadcast Platform, a service-oriented architecture (SOA) for enterprise broadcasting.

## Architecture Overview

The platform consists of:

- **13 Independent Services** communicating through event-driven messaging
- **Platform Core Libraries** (@platform/*) providing shared capabilities
- **Centralized Data Layer** with PostgreSQL and Redis
- **Event Bus** using RabbitMQ for asynchronous communication
- **Observability Stack** with Prometheus, Grafana, and ELK

## Project Structure

```
services/
├── platform-core/
│   └── libs/
│       ├── config/          # Configuration management
│       ├── auth/            # Authentication & authorization
│       ├── logging/         # Structured logging
│       ├── events/          # Event publishing/consumption
│       ├── monitoring/      # Prometheus metrics
│       ├── secrets/         # Secrets management (future)
│       ├── audit/           # Audit trail (future)
│       ├── database/        # Database connection pool (future)
│       └── ...
├── auth-service/           # User authentication & session management
├── reporter-service/       # Reporter portal & broadcast management (coming)
├── media-service/          # Media streaming abstraction (coming)
├── producer-control-service/  # Producer control panel (coming)
└── ...

database/
├── migrations/             # Database schema migrations
└── backups/               # Backup files

ops/
├── prometheus.yml         # Prometheus configuration
└── ...

docker-compose.dev.yml     # Development stack
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm 9+

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build platform-core libraries:**
   ```bash
   npm run build:all
   ```

3. **Start development stack:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. **Run database migrations:**
   ```bash
   # The migrations run automatically on postgres startup
   # Check that the users table exists:
   docker exec tmos-postgres psql -U telemab -d telemab -c "\dt"
   ```

5. **Build and start services:**
   ```bash
   # In development mode (with ts-node for hot reload):
   npm --workspace=auth-service run dev
   ```

   OR

   ```bash
   # In production-like mode:
   npm run build:all
   npm --workspace=auth-service run start
   ```

### Verify Installation

Check that all services are healthy:

```bash
# Auth Service
curl http://localhost:3001/health

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana (login with admin/admin)
open http://localhost:3000
```

## Service Interactions

### Auth Service API

**Login:**
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@telemab.com",
    "password": "admin123"
  }'
```

Response:
```json
{
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 900
  },
  "user": {
    "id": "uuid",
    "email": "admin@telemab.com",
    "name": "Admin User",
    "roles": ["admin", "user"]
  },
  "session": {
    "id": "sess-..."
  }
}
```

**Get Current User (requires auth header):**
```bash
curl http://localhost:3001/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

**Refresh Token:**
```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }'
```

## Monitoring & Observability

### Prometheus Metrics

Available at: http://localhost:9090

Key metrics:
- `http_request_duration_seconds` - HTTP request latency
- `http_requests_total` - Total requests by method/route/status
- `event_published_total` - Events published by type
- `database_query_duration_seconds` - Database query latency

### Grafana Dashboards

Available at: http://localhost:3000 (admin/admin)

Create dashboards for:
- Service health & uptime
- Request latency & error rates
- Event throughput
- Database connection pool

### Logs

Logs are output in structured JSON format to stdout with correlation IDs:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "Auth Service started on port 3001",
  "requestId": "req-...",
  "correlationId": "corr-...",
  "serviceName": "auth-service",
  "environment": "development"
}
```

## Development Workflow

### Adding a New Service

1. Create directory: `services/new-service/`
2. Create package.json with dependencies on @platform/* libs
3. Create TypeScript source in `src/index.ts`
4. Add service to docker-compose.dev.yml
5. Build: `npm run build:all`
6. Test: `npm --workspace=new-service run test`

### Running Tests

```bash
# All tests
npm test

# Single service
npm --workspace=auth-service test

# Watch mode
npm --workspace=auth-service test -- --watch
```

### Code Quality

```bash
# Lint all
npm run lint:all

# Format all
npm run format:all

# Type checking
npm run build:all
```

## Environment Variables

Create `.env` file for local development:

```env
# Service Configuration
ENVIRONMENT=development
LOG_LEVEL=debug

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=telemab
DB_PASSWORD=telemab123
DB_NAME=telemab
DB_SSL=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Security
JWT_SECRET=dev-secret-key-change-in-production-at-least-32-chars
JWT_EXPIRY_MINUTES=15
REFRESH_TOKEN_EXPIRY_DAYS=7

# Service URLs
AUTH_SERVICE_URL=http://localhost:3001
REPORTER_SERVICE_URL=http://localhost:3002
# ... other services
```

## Docker Deployment

### Build Docker Images

```bash
docker build -f services/auth-service/Dockerfile -t tmos-auth-service:latest .
```

### Run in Docker

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Single service
docker-compose -f docker-compose.dev.yml logs -f auth-service
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

## Production Deployment

For production deployment, use:
- Kubernetes (k8s) with Helm charts
- Environment-specific configuration
- Managed PostgreSQL and Redis
- API Gateway (Kong) for routing
- Certificate management (Let's Encrypt)
- Multi-region deployment via Terraform

See `docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md` for detailed production runbook.

## Troubleshooting

### Service fails to start

```bash
# Check logs
docker-compose -f docker-compose.dev.yml logs auth-service

# Common issues:
# 1. Port already in use: Change port in docker-compose.dev.yml
# 2. Database not ready: Wait for postgres healthcheck to pass
# 3. Redis not available: Verify redis is running
```

### Database migration issues

```bash
# Check tables
docker exec tmos-postgres psql -U telemab -d telemab -c "\dt"

# Run migrations manually
docker exec tmos-postgres psql -U telemab -d telemab -f /migrations/001_init_auth.sql
```

### Connection refused errors

```bash
# Verify service is running
curl http://localhost:3001/health

# Check port is open
netstat -an | grep 3001
```

## Next Steps

1. ✅ Platform Core libraries created
2. ✅ Auth Service implemented
3. 🔄 Reporter Service (next milestone)
4. 🔄 Media Service abstraction layer
5. 🔄 Producer Control panel
6. 🔄 Streaming Service
7. 🔄 Recording Service
8. 🔄 And 6 more services...

## References

- [Architecture Documentation](docs/TELEMAB_BROADCAST_PLATFORM_SOA.md)
- [Platform Core Design](docs/PLATFORM_CORE_ARCHITECTURE.md)
- [Implementation Roadmap](docs/SOA_IMPLEMENTATION_ROADMAP.md)
- [Engineering Standards](docs/TMOS_ENGINEERING_STANDARDS.md)
