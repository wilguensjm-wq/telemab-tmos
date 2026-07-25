# Reporter Service - Complete Implementation Guide

## Overview

The Reporter Service is the second business service in the TeleMab Broadcast Platform. It manages reporter presence, status tracking, and real-time updates for the Mission Control dashboard.

**Status:** ✅ Production-ready implementation  
**Scope:** Reporter registration, status management, heartbeat monitoring, event publishing

---

## Service Architecture

### API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/reporters` | ✅ | Register new reporter |
| PATCH | `/reporters/:reporterId/status` | ✅ | Update reporter status |
| POST | `/reporters/:reporterId/heartbeat` | ✅ | Send heartbeat ping |
| GET | `/reporters` | ✅ | Get all reporters (for Mission Control) |
| POST | `/reporters/:reporterId/disconnect` | ✅ | Graceful disconnect |
| GET | `/health` | ❌ | Health check |
| GET | `/ready` | ❌ | Readiness probe |
| GET | `/metrics` | ❌ | Prometheus metrics |

### WebSocket Support

Real-time status updates via WebSocket:
- **Connection:** `/` (WebSocket endpoint)
- **Messages:** Status changes, heartbeats, errors
- **Broadcasting:** All clients receive status changes

---

## End-to-End Workflow

### 1. Reporter Registration

```bash
# Step 1: Login to Auth Service
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reporter@telemab.com",
    "password": "securepass"
  }'

# Response:
{
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 900
  },
  "user": {
    "id": "user-uuid",
    "email": "reporter@telemab.com",
    "name": "John Reporter",
    "roles": ["user"]
  }
}

# Step 2: Register as Reporter
curl -X POST http://localhost:3002/reporters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "name": "John Reporter",
    "location": "Downtown Field"
  }'

# Response:
{
  "id": "reporter-uuid",
  "userId": "user-uuid",
  "name": "John Reporter",
  "location": "Downtown Field",
  "status": "available",
  "lastHeartbeatAt": "2024-01-15T10:30:45.123Z",
  "connectedAt": "2024-01-15T10:30:45.123Z",
  "sessionId": "sess-1705317045123-abc123"
}
```

### 2. Update Status

```bash
# Reporter goes live
curl -X PATCH http://localhost:3002/reporters/reporter-uuid/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "status": "live",
    "reason": "Starting broadcast from location"
  }'

# Response:
{
  "id": "reporter-uuid",
  "status": "live",
  "updatedAt": "2024-01-15T10:31:00.000Z"
}
```

### 3. Send Heartbeat

```bash
# Reporter sends periodic heartbeat
curl -X POST http://localhost:3002/reporters/reporter-uuid/heartbeat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "location": "Downtown Field - North Side"
  }'

# Response:
{
  "success": true,
  "lastHeartbeatAt": "2024-01-15T10:31:30.000Z"
}
```

### 4. Get All Reporters (Mission Control)

```bash
# Mission Control dashboard fetches active reporters
curl http://localhost:3002/reporters \
  -H "Authorization: Bearer eyJhbGc..."

# Response:
{
  "reporters": [
    {
      "id": "reporter-uuid",
      "userId": "user-uuid",
      "name": "John Reporter",
      "location": "Downtown Field",
      "status": "live",
      "lastHeartbeatAt": "2024-01-15T10:31:30.000Z",
      "connectedAt": "2024-01-15T10:30:45.123Z"
    }
  ],
  "count": 1,
  "timestamp": "2024-01-15T10:32:00.000Z"
}
```

### 5. Graceful Disconnect

```bash
# Reporter disconnects cleanly
curl -X POST http://localhost:3002/reporters/reporter-uuid/disconnect \
  -H "Authorization: Bearer eyJhbGc..."

# Response:
{
  "id": "reporter-uuid",
  "status": "offline"
}
```

---

## Database Schema

### reporters table
```sql
id          UUID PRIMARY KEY
user_id     UUID NOT NULL (foreign key to users)
name        VARCHAR(255) NOT NULL
location    VARCHAR(255)
status      VARCHAR(50) - 'available', 'live', 'busy', 'offline'
last_heartbeat_at  TIMESTAMP
connected_at       TIMESTAMP
disconnected_at    TIMESTAMP
created_at  TIMESTAMP
updated_at  TIMESTAMP
deleted_at  TIMESTAMP (soft delete)
```

### reporter_sessions table
```sql
id          UUID PRIMARY KEY
reporter_id UUID NOT NULL (foreign key to reporters)
session_id  VARCHAR(255) UNIQUE
ip_address  VARCHAR(45)
user_agent  VARCHAR(1024)
started_at  TIMESTAMP
ended_at    TIMESTAMP
heartbeat_count INT
created_at  TIMESTAMP
```

### reporter_status_history table (Audit Trail)
```sql
id          UUID PRIMARY KEY
reporter_id UUID NOT NULL
session_id  UUID (foreign key to sessions)
old_status  VARCHAR(50)
new_status  VARCHAR(50)
reason      VARCHAR(255)
created_at  TIMESTAMP (immutable, insert-only)
```

### reporter_activity table
```sql
id          UUID PRIMARY KEY
reporter_id UUID NOT NULL
session_id  UUID
activity_type VARCHAR(100)
metadata    JSONB
created_at  TIMESTAMP
```

---

## Events Published

The Reporter Service publishes the following events to RabbitMQ:

### reporter.registered
```json
{
  "eventId": "evt-123",
  "eventType": "reporter.registered",
  "correlationId": "corr-456",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "source": "reporter-service",
  "data": {
    "reporterId": "reporter-uuid",
    "userId": "user-uuid",
    "name": "John Reporter",
    "location": "Downtown Field",
    "status": "available",
    "sessionId": "sess-123"
  }
}
```

### reporter.status_changed
```json
{
  "eventType": "reporter.status_changed",
  "data": {
    "reporterId": "reporter-uuid",
    "userId": "user-uuid",
    "oldStatus": "available",
    "newStatus": "live",
    "reason": "Starting broadcast",
    "timestamp": "2024-01-15T10:31:00.000Z"
  }
}
```

### reporter.heartbeat_timeout
```json
{
  "eventType": "reporter.heartbeat_timeout",
  "data": {
    "reporterId": "reporter-uuid"
  }
}
```

### reporter.disconnected
```json
{
  "eventType": "reporter.disconnected",
  "data": {
    "reporterId": "reporter-uuid",
    "userId": "user-uuid",
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

---

## Heartbeat Mechanism

### How It Works

1. **Reporter sends heartbeat** every 30 seconds:
   ```bash
   POST /reporters/:reporterId/heartbeat
   ```

2. **Server records timestamp**:
   - Updates `last_heartbeat_at` in database
   - Increments `heartbeat_count` in session record
   - Optionally updates location if provided

3. **Heartbeat monitoring** runs every 30 seconds:
   - Checks for reporters with `last_heartbeat_at > 60 seconds ago`
   - Sets status to 'offline' if timeout detected
   - Publishes `reporter.heartbeat_timeout` event
   - Broadcasts status change to WebSocket clients

### Timeout Detection

- **Heartbeat interval:** 30 seconds (reporter sends ping)
- **Timeout threshold:** 60 seconds (server waits)
- **Monitoring interval:** 30 seconds (server checks)

If reporter doesn't send heartbeat within 60 seconds, it's automatically marked as offline.

---

## WebSocket Real-Time Updates

### Connection

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3002');

ws.onopen = () => {
  // Connection established
  console.log('Connected to Reporter Service');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'status_change') {
    console.log(`Reporter ${message.payload.reporterId} changed to ${message.payload.status}`);
  }
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

### Message Types

**Ping/Pong (Heartbeat)**
```json
{
  "type": "ping",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**Status Change**
```json
{
  "type": "status_change",
  "payload": {
    "reporterId": "reporter-uuid",
    "status": "live",
    "timestamp": "2024-01-15T10:31:00.000Z"
  },
  "timestamp": "2024-01-15T10:31:00.000Z"
}
```

**Error**
```json
{
  "type": "error",
  "payload": {
    "message": "Invalid message format"
  },
  "timestamp": "2024-01-15T10:31:00.000Z"
}
```

---

## Platform Core Integration

### Libraries Used

```typescript
import { loadConfig } from '@platform/config';
import { createLogger, expressLoggingMiddleware } from '@platform/logging';
import { MetricsCollector, expressMetricsMiddleware } from '@platform/monitoring';
import { authMiddleware, requireAuth } from '@platform/auth';
import { EventPublisher } from '@platform/events';
```

### Middleware Stack

```typescript
app.use(expressLoggingMiddleware(config));      // Correlation IDs
app.use(expressMetricsMiddleware(metricsCollector)); // Prometheus
app.use(authMiddleware(config, logger));        // JWT validation
```

### Configuration

All configuration from environment variables:
```env
SERVICE_NAME=reporter-service
SERVICE_PORT=3002
ENVIRONMENT=development
LOG_LEVEL=debug
DB_HOST=postgres
DB_PORT=5432
DB_USER=telemab
DB_PASSWORD=telemab123
REDIS_HOST=redis
REDIS_PORT=6379
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
JWT_SECRET=dev-secret-key-change-in-production
```

---

## Logging & Observability

### Structured Logs

Every action generates structured logs with correlation IDs:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "message": "Reporter registered",
  "requestId": "req-1705317045123-abc",
  "correlationId": "corr-456",
  "serviceName": "reporter-service",
  "reporterId": "reporter-uuid",
  "userId": "user-uuid",
  "name": "John Reporter"
}
```

### Prometheus Metrics

Available at `http://localhost:3002/metrics`:

```
http_request_duration_seconds - Request latency by method/route/status
http_requests_total - Total requests by method/route/status
event_published_total - Events published by type
database_query_duration_seconds - Query latency by type
cache_hits_total - Cache hits
cache_misses_total - Cache misses
```

### Grafana Dashboards

Create dashboards for:
- Reporter count by status
- Registration rate
- Status change frequency
- Heartbeat latency
- Event throughput

---

## Testing the Service

### Start Services

```bash
cd /home/telemab/docker/tmos
make dev              # Start infrastructure
make status           # Verify all services running
```

### Manual Testing

```bash
# 1. Health check
curl http://localhost:3002/health

# 2. Get access token from Auth Service
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@telemab.com","password":"admin123"}' \
  | jq -r '.tokens.accessToken')

# 3. Register reporter
curl -X POST http://localhost:3002/reporters \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test Reporter","location":"Field"}'

# 4. Get reporters list
curl http://localhost:3002/reporters \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. View metrics
curl http://localhost:3002/metrics
```

### Unit Tests

```bash
npm --workspace=reporter-service test
```

### Integration Tests (Coming)

```bash
npm --workspace=reporter-service test -- --testMatch='**/*.integration.test.ts'
```

---

## Deployment

### Docker Build

```bash
docker build -f services/reporter-service/Dockerfile -t tmos-reporter-service:latest .
```

### Docker Run (Standalone)

```bash
docker run -d \
  --name reporter-service \
  -p 3002:3002 \
  -e SERVICE_NAME=reporter-service \
  -e SERVICE_PORT=3002 \
  -e DB_HOST=postgres \
  -e REDIS_HOST=redis \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  tmos-reporter-service:latest
```

### Kubernetes (Production)

See `docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md` for Helm charts and manifests.

---

## Success Criteria Validation

### ✅ All Criteria Met

1. ✅ **Authenticate through Auth Service**
   - Uses JWT tokens from Auth Service
   - Validates with `@platform/auth` middleware

2. ✅ **Establish connection with Reporter Service**
   - REST API endpoints working
   - WebSocket support for real-time updates

3. ✅ **Register presence with TMOS**
   - POST /reporters creates reporter record
   - Stores in PostgreSQL with user_id reference

4. ✅ **Send periodic heartbeat updates**
   - POST /reporters/:reporterId/heartbeat
   - Server records timestamp
   - Timeout detection after 60 seconds

5. ✅ **Update status (Available, Live, Busy, Offline)**
   - PATCH /reporters/:reporterId/status
   - Validates status enum
   - Records history in audit table

6. ✅ **Disconnect cleanly**
   - POST /reporters/:reporterId/disconnect
   - Sets status to 'offline'
   - Ends session record

7. ✅ **Appear in Mission Control dashboard**
   - GET /reporters returns all active reporters
   - Real-time updates via WebSocket
   - Status changes broadcast immediately

8. ✅ **Generate structured audit and event logs**
   - Correlation IDs on every request
   - Status history in immutable table
   - Activity log with metadata
   - Events published to RabbitMQ

9. ✅ **Expose /health and /metrics endpoints**
   - GET /health returns service status
   - GET /metrics returns Prometheus metrics
   - Both include timestamp

10. ✅ **Publish status changes through RabbitMQ**
    - EventPublisher sends events
    - Routing keys: reporter.*
    - Events: registered, status_changed, heartbeat_timeout, disconnected

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│   Reporter (Mobile/Web Client)      │
└─────────────────────────────────────┘
              ↓
    ┌─────────────────────┐
    │  Auth Service       │
    │  (JWT Validation)   │
    └─────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Reporter Service                  │
│   ├─ Register Reporter              │
│   ├─ Update Status                  │
│   ├─ Heartbeat Mechanism            │
│   ├─ Real-time WebSocket            │
│   └─ Event Publishing               │
└─────────────────────────────────────┘
        │         │         │
        ↓         ↓         ↓
    ┌────────┐ ┌─────┐ ┌─────────┐
    │  DB    │ │Redis│ │RabbitMQ │
    │        │ │     │ │ (Events)│
    └────────┘ └─────┘ └─────────┘
        ↓                  ↓
    ┌────────┐        ┌──────────────┐
    │Audit   │        │Other Services│
    │History │        │(AI, Analytics│
    │        │        │ Monitoring)  │
    └────────┘        └──────────────┘
```

---

## Next Steps

### Phase 2 (Week 3)

1. **Media Service** - LiveKit abstraction layer
2. **Producer Control Service** - Broadcasting commands
3. **Streaming Service** - Stream management

### Phase 3 (Weeks 4-24)

- Recording Service
- Asset Management
- AI Integration
- Notification Service
- Analytics Service
- Monitoring Service
- Admin Service
- Licensing Service

---

## References

- [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md)
- [PLATFORM_CORE_ARCHITECTURE.md](../docs/PLATFORM_CORE_ARCHITECTURE.md)
- [TELEMAB_BROADCAST_PLATFORM_SOA.md](../docs/TELEMAB_BROADCAST_PLATFORM_SOA.md)
- [TMOS_ENGINEERING_STANDARDS.md](../docs/TMOS_ENGINEERING_STANDARDS.md)

---

**Reporter Service - Production Ready ✅**
