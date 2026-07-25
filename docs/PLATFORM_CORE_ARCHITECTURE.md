# TeleMab Broadcast Platform - Platform Core Design

**Document Type:** Infrastructure Architecture  
**Audience:** Platform Engineers, Architecture Review  
**Status:** Pre-Implementation  
**Scope:** Shared capabilities for all 13 services  

---

## Platform Core Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│         Application Layer (13 Business Services)                      │
│         ┌─────────────────────────────────────────────────────┐      │
│         │ Reporter │ Media │ Producer │ Streaming │ Recording │ ... │
│         └─────────────────────────────────────────────────────┘      │
│                          │                                            │
│         ┌────────────────┴────────────────┐                          │
│         │   Platform Core (Shared Libs)   │                          │
│         └────────────────┬────────────────┘                          │
│                          │                                            │
│   ┌─────────┬────────┬───┴───┬──────┬──────────┬──────────────┐      │
│   │ API GW  │ Auth   │ Config│Event │ Logging  │ Monitoring   │      │
│   ├─────────┼────────┼───────┼──────┼──────────┼──────────────┤      │
│   │ Secrets │ Audit  │License│Billing│Discovery│ Tracing      │      │
│   └─────────┴────────┴───────┴──────┴──────────┴──────────────┘      │
│                          │                                            │
│   ┌─────────────────────┴─────────────────────┐                      │
│   │   Infrastructure Layer (Databases)        │                      │
│   └────────┬────────────┬──────────┬──────────┘                      │
│            │            │          │                                 │
│      PostgreSQL    Redis      RabbitMQ                               │
│      (Primary)   (Cache)    (Events)                                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 1. API Gateway (Kong / Nginx API Gateway)

### Purpose
Single entry point for all client requests, routing, rate limiting, protocol translation.

### Responsibilities
- ✓ HTTP/HTTPS termination
- ✓ Request routing to backend services
- ✓ Rate limiting per user/API key
- ✓ JWT token validation (delegated to Auth Service)
- ✓ CORS handling
- ✓ Request/response logging
- ✓ Protocol translation (HTTP → gRPC, HTTP → WebSocket)
- ✓ Circuit breaker for down services
- ✓ Request/response transformation

### Configuration (Kong)

```yaml
# services/platform-core/kong/kong.yml
_format_version: "2.1"
_transform: true

services:
  - name: auth-service
    url: http://auth-service:3001
    routes:
      - name: auth-routes
        paths:
          - /auth/v1/
    plugins:
      - name: rate-limiting
        config:
          minute: 1000
          policy: local

  - name: reporter-service
    url: http://reporter-service:3002
    routes:
      - name: reporter-routes
        paths:
          - /reporters/v1/
    plugins:
      - name: jwt
        config:
          key_claim_name: "sub"
          secret_is_base64: false
      - name: rate-limiting
        config:
          minute: 500

  - name: media-service
    url: http://media-service:3003
    routes:
      - name: media-routes
        paths:
          - /media/v1/
    plugins:
      - name: jwt
      - name: rate-limiting

  # ... repeat for all 13 services

global_plugins:
  - name: cors
    config:
      origins: "*"
      credentials: true
      headers: "Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Auth-Token, Authorization"
      methods: "GET, HEAD, PUT, PATCH, POST, DELETE"

  - name: request-transformer
    config:
      add:
        headers:
          - "X-Request-ID:${request_id}"
          - "X-Forwarded-For:${client_ip}"
          - "X-Service-Version:v1"

  - name: response-transformer
    config:
      add:
        headers:
          - "X-Response-Time:${response_time}ms"
          - "Cache-Control:public, max-age=300"

  - name: access-log
    config:
      http_log_plugin:
        http_endpoint: http://logging-service:9200
```

### Docker Compose Integration

```yaml
services:
  kong:
    image: kong:3.4-alpine
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: postgres
      KONG_PG_USER: kong
      KONG_PG_PASSWORD: ${KONG_DB_PASSWORD}
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
    ports:
      - "8000:8000"    # Proxy
      - "8001:8001"    # Admin API
    depends_on:
      - postgres
    networks:
      - platform
    volumes:
      - ./kong/kong.yml:/kong/kong.yml:ro
```

---

## 2. Identity & Authentication Service

### Core Responsibility
Centralized user authentication, JWT issuance, MFA coordination.

### Architecture

```typescript
// services/platform-core/libs/auth/src/index.ts

export interface AuthService {
  // Login/Logout
  login(credentials: Credentials): Promise<AuthToken>;
  logout(userId: string, sessionId: string): Promise<void>;
  
  // Token Management
  validateToken(token: string): Promise<TokenPayload>;
  refreshToken(refreshToken: string): Promise<AuthToken>;
  revokeToken(token: string): Promise<void>;
  
  // MFA
  requestMFA(userId: string): Promise<MFAChallenge>;
  verifyMFA(userId: string, code: string): Promise<void>;
  
  // User Verification
  verifyUser(userId: string): Promise<User>;
}

export interface AuthToken {
  access_token: string;      // JWT, 15 min TTL
  refresh_token: string;     // Opaque token, 7 day TTL
  expires_in: number;
  token_type: 'Bearer';
}

export interface TokenPayload {
  sub: string;               // user_id
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  aud: string;               // service claiming token
}
```

### Shared Authentication Middleware

```typescript
// services/platform-core/libs/auth/src/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './authService';

export function authMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Missing authorization token' });
      }

      // Validate token with Auth Service
      const payload = await authService.validateToken(token);
      
      // Attach to request context
      req.user = payload;
      req.headers['x-user-id'] = payload.sub;
      req.headers['x-request-id'] = req.headers['x-request-id'] || generateRequestId();
      
      next();
    } catch (error) {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

// Every service uses this identical middleware
// services/reporter-service/src/index.ts
import { authMiddleware } from '@platform/auth';

const app = express();
app.use(authMiddleware(authServiceClient));
```

### JWT Token Structure

```json
{
  "sub": "reporter-001",
  "email": "john@news.com",
  "roles": ["reporter", "user"],
  "permissions": [
    "publish:video",
    "publish:audio",
    "join:broadcast"
  ],
  "service_tier": "professional",
  "device_id": "device-abc123",
  "iat": 1721929000,
  "exp": 1721929900,
  "aud": "reporter-portal"
}
```

### Redis Session Cache

```typescript
// All sessions cached for <100ms lookup
// TTL: 7 days (matches refresh token)

interface Session {
  user_id: string;
  session_id: string;
  refresh_token_hash: string;
  mfa_verified: boolean;
  last_activity: number;
  device_fingerprint: string;
  ip_address: string;
}

// Set in Redis:
await redis.set(
  `session:${sessionId}`,
  JSON.stringify(session),
  'EX',
  7 * 24 * 60 * 60  // 7 days
);

// Get in Redis:
const session = await redis.get(`session:${sessionId}`);
```

---

## 3. Configuration Management

### Design Pattern

Every service uses the same configuration approach:
- **Environment variables** for deployment-specific values
- **Centralized config service** for application logic
- **Feature flags** for gradual rollouts
- **No hardcoded values** in code

### Configuration Structure

```typescript
// services/platform-core/libs/config/src/config.ts

export interface PlatformConfig {
  // Deployment
  environment: 'development' | 'staging' | 'production';
  nodeEnv: string;
  logLevel: string;
  
  // API Configuration
  apiBaseUrl: string;
  apiPort: number;
  apiTimeout: number;
  
  // Service Locations
  services: {
    auth: string;
    reporter: string;
    media: string;
    // ... all 13 services
  };
  
  // Database
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
    maxConnections: number;
  };
  
  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  
  // RabbitMQ
  rabbitmq: {
    url: string;
    prefetch: number;
    consumerTag: string;
  };
  
  // Media (LiveKit)
  livekit: {
    url: string;
    apiKey: string;
    apiSecret: string;
  };
  
  // Feature Flags
  features: {
    enableAI: boolean;
    enableMultiRegion: boolean;
    enableWhiteLabel: boolean;
    recordingMaxDuration: number;
  };
  
  // Security
  security: {
    jwtSecret: string;
    jwtExpiry: number;
    passwordHashRounds: number;
    corsOrigins: string[];
  };
  
  // Monitoring
  monitoring: {
    metricsPort: number;
    healthCheckInterval: number;
    enableTracing: boolean;
  };
}

export function loadConfig(): PlatformConfig {
  return {
    environment: process.env.ENVIRONMENT || 'development',
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
    apiPort: parseInt(process.env.API_PORT || '3000'),
    apiTimeout: parseInt(process.env.API_TIMEOUT || '30000'),
    
    services: {
      auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      reporter: process.env.REPORTER_SERVICE_URL || 'http://reporter-service:3002',
      media: process.env.MEDIA_SERVICE_URL || 'http://media-service:3003',
      // ... populated from env vars
    },
    
    database: {
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'telemab',
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    },
    
    // ... rest of config from environment
  };
}
```

### Environment Files

```bash
# .env.development (local development)
ENVIRONMENT=development
LOG_LEVEL=debug
DB_HOST=localhost
DB_PORT=5432
REDIS_HOST=localhost
RABBITMQ_URL=amqp://localhost:5672

# .env.staging (staging environment)
ENVIRONMENT=staging
LOG_LEVEL=info
DB_HOST=postgres-staging.internal
DB_PORT=5432
REDIS_HOST=redis-staging.internal
RABBITMQ_URL=amqp://rabbitmq-staging.internal:5672

# .env.production (production)
ENVIRONMENT=production
LOG_LEVEL=warn
DB_HOST=postgres-prod.rds.amazonaws.com
DB_PORT=5432
REDIS_HOST=redis-prod.elasticache.amazonaws.com
RABBITMQ_URL=amqp://rabbitmq-prod.internal:5672
```

### Usage in Every Service

```typescript
// services/reporter-service/src/index.ts
import { loadConfig } from '@platform/config';

const config = loadConfig();

const app = express();
app.listen(config.apiPort, () => {
  console.log(`Reporter Service listening on port ${config.apiPort}`);
});

// Access service discovery
const mediaServiceUrl = config.services.media;
const response = await fetch(`${mediaServiceUrl}/media/v1/sessions`);
```

---

## 4. Secrets Management

### Design Pattern

Never store secrets in code, config files, or environment variables in source control.

### Approach: Vault Integration

```typescript
// services/platform-core/libs/secrets/src/secretsManager.ts

export interface SecretsManager {
  getSecret(key: string): Promise<string>;
  getSecrets(keys: string[]): Promise<Record<string, string>>;
  setSecret(key: string, value: string): Promise<void>;
  rotateSecret(key: string): Promise<string>;
}

export class HashicorpVaultSecretsManager implements SecretsManager {
  constructor(private vaultClient: VaultClient) {}

  async getSecret(key: string): Promise<string> {
    const response = await this.vaultClient.read(`secret/data/${key}`);
    return response.data.data.value;
  }

  async getSecrets(keys: string[]): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};
    for (const key of keys) {
      secrets[key] = await this.getSecret(key);
    }
    return secrets;
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.vaultClient.write(`secret/data/${key}`, { data: { value } });
  }

  async rotateSecret(key: string): Promise<string> {
    const newSecret = generateRandomSecret(32);
    await this.setSecret(key, newSecret);
    return newSecret;
  }
}
```

### Vault Secret Paths

```
secret/telemab/
├── jwt-secret              # JWT signing key
├── database-password       # PostgreSQL password
├── livekit-api-key         # LiveKit credentials
├── livekit-api-secret
├── stripe-api-key          # Billing
├── sendgrid-api-key        # Notifications
├── twilio-auth-token       # SMS
├── aws-access-key          # S3 access
├── aws-secret-key
└── encryption-key          # Data encryption
```

### Deployment Integration

```yaml
# Docker Compose with Vault
services:
  auth-service:
    environment:
      VAULT_ADDR: http://vault:8200
      VAULT_TOKEN: ${VAULT_TOKEN}
      VAULT_SKIP_VERIFY: false
    depends_on:
      - vault
    
  # Initialize Vault with secrets
  vault-init:
    image: vault:1.15
    entrypoint: /bin/sh
    command: |
      -c 'vault login -method=kubernetes
          vault kv put secret/telemab/jwt-secret value=${JWT_SECRET}
          vault kv put secret/telemab/database-password value=${DB_PASSWORD}'
```

---

## 5. Event Bus (RabbitMQ / Kafka)

### Design Pattern

All service-to-service communication via event bus (async).

### Message Structure

```typescript
// services/platform-core/libs/events/src/eventTypes.ts

export interface PlatformEvent {
  // Metadata
  event_id: string;           // UUID
  event_type: string;         // e.g., "reporter.joined"
  timestamp: string;          // ISO 8601
  version: number;            // Schema version
  
  // Source
  source_service: string;     // e.g., "media-service"
  source_user_id?: string;    // Who triggered event
  
  // Routing
  routing_key: string;        // e.g., "media.session.*"
  correlation_id: string;     // Link related events
  
  // Payload
  data: Record<string, any>;  // Event-specific data
  
  // Metadata
  headers: Record<string, string>;
}

export interface EventHandler<T extends PlatformEvent> {
  handle(event: T): Promise<void>;
  canHandle(eventType: string): boolean;
}
```

### RabbitMQ Configuration

```yaml
# services/platform-core/rabbitmq/declarations.yaml
exchanges:
  - name: platform.events
    type: topic
    durable: true
    arguments:
      x-message-ttl: 86400000  # 24 hours

  - name: platform.dlx         # Dead Letter Exchange
    type: topic
    durable: true

queues:
  # Media Service queues
  - name: media.session.created.queue
    durable: true
    arguments:
      x-dead-letter-exchange: platform.dlx
      x-dead-letter-routing-key: dlx.media.session.created
    bindings:
      - exchange: platform.events
        routing_key: media.session.created

  - name: media.participant.joined.queue
    durable: true
    bindings:
      - exchange: platform.events
        routing_key: media.participant.joined

  # Notification Service queues (subscribes to everything)
  - name: notification.all.queue
    durable: true
    bindings:
      - exchange: platform.events
        routing_key: "*.#"  # Match all events

  # Analytics Service queues
  - name: analytics.events.queue
    durable: true
    bindings:
      - exchange: platform.events
        routing_key: "*.#"

  # Audit Trail queue (immutable log)
  - name: audit.all.queue
    durable: true
    bindings:
      - exchange: platform.events
        routing_key: "*.#"
```

### Event Publisher Library

```typescript
// services/platform-core/libs/events/src/eventPublisher.ts

export class EventPublisher {
  constructor(
    private amqp: amqplib.Connection,
    private config: PlatformConfig
  ) {}

  async publish<T extends PlatformEvent>(event: T): Promise<void> {
    const channel = await this.amqp.createChannel();
    
    // Assert exchange exists
    await channel.assertExchange('platform.events', 'topic', { durable: true });
    
    // Publish event
    const published = channel.publish(
      'platform.events',
      event.routing_key,
      Buffer.from(JSON.stringify(event)),
      {
        contentType: 'application/json',
        persistent: true,
        headers: {
          'x-correlation-id': event.correlation_id,
          'x-request-id': event.event_id,
        },
      }
    );
    
    if (!published) {
      throw new Error(`Failed to publish event: ${event.event_type}`);
    }
    
    // Log event
    this.logger.info('Event published', {
      event_type: event.event_type,
      routing_key: event.routing_key,
      correlation_id: event.correlation_id,
    });
  }
}
```

### Event Consumer Pattern

```typescript
// services/notification-service/src/eventHandlers/reporterOfflineHandler.ts

import { EventHandler, PlatformEvent } from '@platform/events';

export class ReporterOfflineEventHandler implements EventHandler<ReporterOfflineEvent> {
  constructor(private notificationService: NotificationService) {}

  canHandle(eventType: string): boolean {
    return eventType === 'reporter.offline';
  }

  async handle(event: ReporterOfflineEvent): Promise<void> {
    // Send notification to producer
    await this.notificationService.send({
      recipient_id: event.data.broadcast_producer_id,
      channel: 'email',
      subject: `Reporter ${event.data.reporter_call_sign} Went Offline`,
      message: `${event.data.reporter_name} disconnected at ${event.timestamp}`,
      priority: 'high',
    });
  }
}

// services/platform-core/libs/events/src/eventConsumer.ts
export class EventConsumer {
  private handlers: Map<string, EventHandler[]> = new Map();

  register(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  async consume(event: PlatformEvent): Promise<void> {
    const handlers = this.handlers.get(event.event_type) || [];
    
    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        // Send to DLX for retry
        this.logger.error('Event handler failed', {
          event_type: event.event_type,
          handler: handler.constructor.name,
          error: error.message,
        });
      }
    }
  }
}
```

---

## 6. Logging (Structured Logging with Correlation)

### Shared Logging Library

```typescript
// services/platform-core/libs/logging/src/logger.ts

export interface LogContext {
  request_id: string;
  correlation_id: string;
  user_id?: string;
  service_name: string;
  environment: string;
}

export class Logger {
  constructor(private context: LogContext) {}

  info(message: string, metadata?: Record<string, any>): void {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...this.context,
      ...metadata,
    }));
  }

  error(message: string, error: Error, metadata?: Record<string, any>): void {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...this.context,
      ...metadata,
    }));
  }

  warn(message: string, metadata?: Record<string, any>): void {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...this.context,
      ...metadata,
    }));
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message,
        ...this.context,
        ...metadata,
      }));
    }
  }
}

// Middleware to inject logger
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const context: LogContext = {
    request_id: req.headers['x-request-id'] as string || generateRequestId(),
    correlation_id: req.headers['x-correlation-id'] as string || generateRequestId(),
    user_id: req.user?.sub,
    service_name: process.env.SERVICE_NAME || 'unknown',
    environment: process.env.ENVIRONMENT || 'development',
  };

  req.logger = new Logger(context);
  next();
}
```

### Elasticsearch Integration

```yaml
# docker-compose.yml - ELK Stack
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    environment:
      - discovery.type=single-node
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    ports:
      - "9200:9200"

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.0.0
    volumes:
      - /var/log/telemab:/var/log/telemab:ro
      - ./filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
    command: filebeat -e -strict.perms=false
```

### Filebeat Configuration

```yaml
# services/platform-core/filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/telemab/*/stdout.log
    json.message_key: message
    json.keys_under_root: true
    tags: ["telemab"]

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "telemab-%{+yyyy.MM.dd}"
  username: "elastic"
  password: "${ELASTIC_PASSWORD}"

processors:
  - add_host_metadata: ~
  - add_process_metadata: ~
```

---

## 7. Monitoring (Prometheus + Grafana)

### Shared Metrics Library

```typescript
// services/platform-core/libs/monitoring/src/metrics.ts

export class MetricsCollector {
  private metrics = {
    httpRequestDuration: new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code', 'service'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    }),

    httpRequestTotal: new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'service'],
    }),

    dbQueryDuration: new prometheus.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration',
      labelNames: ['query_type', 'operation', 'status'],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
    }),

    eventProcessingDuration: new prometheus.Histogram({
      name: 'event_processing_duration_seconds',
      help: 'Event processing time',
      labelNames: ['event_type', 'handler', 'status'],
      buckets: [0.01, 0.1, 0.5, 1, 5],
    }),

    activeSessions: new prometheus.Gauge({
      name: 'active_sessions',
      help: 'Number of active user sessions',
      labelNames: ['service'],
    }),

    cacheHitRate: new prometheus.Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type'],
    }),
  };

  recordHttpRequest(method: string, route: string, status: number, duration: number): void {
    this.metrics.httpRequestDuration.labels(method, route, status, process.env.SERVICE_NAME).observe(duration);
    this.metrics.httpRequestTotal.labels(method, route, status, process.env.SERVICE_NAME).inc();
  }

  recordDbQuery(type: string, operation: string, duration: number, status: string): void {
    this.metrics.dbQueryDuration.labels(type, operation, status).observe(duration);
  }

  recordEventProcessing(eventType: string, handler: string, duration: number, status: string): void {
    this.metrics.eventProcessingDuration.labels(eventType, handler, status).observe(duration);
  }
}

// Middleware for HTTP metrics
export function metricsMiddleware(metricsCollector: MetricsCollector) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      metricsCollector.recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
    });
    
    next();
  };
}
```

### Prometheus Configuration

```yaml
# services/platform-core/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'telemab-services'
    static_configs:
      - targets:
          - 'auth-service:3001'
          - 'reporter-service:3002'
          - 'media-service:3003'
          - 'producer-service:3004'
          - 'streaming-service:3005'
          - 'recording-service:3006'
          - 'asset-service:3007'
          - 'ai-service:3008'
          - 'notification-service:3009'
          - 'analytics-service:3010'
          - 'monitoring-service:3011'
          - 'admin-service:3012'
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: postgres-exporter:9187

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "TeleMab Platform Overview",
    "panels": [
      {
        "title": "HTTP Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "API Latency (p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, http_request_duration_seconds)"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status_code=~\"5..\"}[5m])"
          }
        ]
      },
      {
        "title": "Active Sessions",
        "targets": [
          {
            "expr": "active_sessions"
          }
        ]
      },
      {
        "title": "Event Processing Duration",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, event_processing_duration_seconds)"
          }
        ]
      }
    ]
  }
}
```

---

## 8. Audit Trail (Immutable Event Log)

### Design Pattern

Every action that affects user data or compliance is logged immutably.

### Audit Event Schema

```typescript
// services/platform-core/libs/audit/src/auditLog.ts

export interface AuditEvent {
  // Immutable metadata
  audit_id: string;              // UUID
  timestamp: string;             // ISO 8601
  correlation_id: string;        // Link to business event
  
  // Actor
  user_id: string;
  user_email: string;
  ip_address: string;
  user_agent: string;
  
  // Action
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  resource_type: string;         // e.g., "reporter", "broadcast"
  resource_id: string;
  
  // Change
  old_values: Record<string, any>;   // Before state
  new_values: Record<string, any>;   // After state
  
  // Context
  service_name: string;
  environment: string;
  
  // Compliance
  compliance_relevant: boolean;
  gdpr_relevant: boolean;
}
```

### Audit Logging Middleware

```typescript
// services/platform-core/libs/audit/src/auditMiddleware.ts

export async function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Capture request body (for POST/PUT/PATCH)
  const originalBody = req.body;
  
  res.on('finish', async () => {
    // Only log state-changing operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return;
    }

    if (res.statusCode >= 400) {
      return; // Don't log failed operations
    }

    const auditEvent: AuditEvent = {
      audit_id: generateUUID(),
      timestamp: new Date().toISOString(),
      correlation_id: req.headers['x-correlation-id'] as string,
      user_id: req.user?.sub || 'system',
      user_email: req.user?.email || 'system',
      ip_address: req.ip || '',
      user_agent: req.headers['user-agent'] || '',
      action: mapMethodToAction(req.method),
      resource_type: extractResourceType(req.path),
      resource_id: extractResourceId(req.path),
      old_values: {},           // Fetch from database if needed
      new_values: originalBody,
      service_name: process.env.SERVICE_NAME || 'unknown',
      environment: process.env.ENVIRONMENT || 'development',
      compliance_relevant: isComplianceRelevant(req.path),
      gdpr_relevant: req.path.includes('/user/') || req.path.includes('/profile/'),
    };

    // Write to audit log (PostgreSQL)
    await auditLogService.log(auditEvent);
    
    // Publish to audit queue
    await eventBus.publish('audit.action', auditEvent);
  });

  next();
}
```

### Audit Database Schema

```sql
-- services/platform-core/migrations/audit_schema.sql

CREATE SCHEMA audit;

CREATE TABLE audit.events (
  audit_id UUID PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  correlation_id UUID,
  
  user_id UUID NOT NULL,
  user_email VARCHAR(255),
  ip_address INET,
  
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID NOT NULL,
  
  old_values JSONB,
  new_values JSONB,
  
  service_name VARCHAR(100),
  environment VARCHAR(50),
  
  compliance_relevant BOOLEAN DEFAULT FALSE,
  gdpr_relevant BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Immutable (insert-only)
CREATE RULE audit_events_no_update AS
  ON UPDATE TO audit.events DO INSTEAD NOTHING;

CREATE RULE audit_events_no_delete AS
  ON DELETE TO audit.events DO INSTEAD NOTHING;

-- Indexes for fast audit retrieval
CREATE INDEX idx_audit_user ON audit.events(user_id, timestamp);
CREATE INDEX idx_audit_resource ON audit.events(resource_type, resource_id);
CREATE INDEX idx_audit_timestamp ON audit.events(timestamp);
CREATE INDEX idx_audit_compliance ON audit.events(compliance_relevant);
```

---

## 9. Licensing & Feature Gates

### Licensing System

```typescript
// services/platform-core/libs/licensing/src/licenseManager.ts

export enum FeatureTier {
  FREE = 'free',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export interface License {
  license_id: string;
  customer_id: string;
  tier: FeatureTier;
  max_reporters: number;
  max_concurrent_broadcasts: number;
  max_storage_gb: number;
  features: {
    ai_enabled: boolean;
    multi_region: boolean;
    white_label: boolean;
    api_access: boolean;
    sso: boolean;
  };
  issued_at: Date;
  expires_at: Date;
  auto_renew: boolean;
}

export class LicenseManager {
  async validateLicense(customerId: string): Promise<License> {
    // Check Redis cache first (1-hour TTL)
    const cached = await this.redis.get(`license:${customerId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const license = await this.db.licenses.findOne({ customer_id: customerId });
    
    if (!license) {
      throw new Error(`No license found for customer: ${customerId}`);
    }

    if (license.expires_at < new Date()) {
      throw new Error(`License expired for customer: ${customerId}`);
    }

    // Cache for 1 hour
    await this.redis.setex(
      `license:${customerId}`,
      3600,
      JSON.stringify(license)
    );

    return license;
  }

  async checkFeatureAccess(
    customerId: string,
    feature: keyof License['features']
  ): Promise<boolean> {
    const license = await this.validateLicense(customerId);
    return license.features[feature] || false;
  }
}
```

### Feature Gate Middleware

```typescript
// services/platform-core/libs/licensing/src/featureGateMiddleware.ts

export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = req.user?.customer_id;
      const allowed = await licenseManager.checkFeatureAccess(customerId, feature as any);
      
      if (!allowed) {
        return res.status(403).json({
          error: 'Feature not available in your plan',
          feature,
          upgrade_url: 'https://telemab.com/pricing',
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'License validation failed' });
    }
  };
}

// Usage in services:
app.post('/recordings/v1/:id/transcribe', 
  authMiddleware,
  requireFeature('ai_enabled'),
  transcribeHandler
);
```

---

## 10. Billing & Usage Metering

### Usage Events

```typescript
// services/platform-core/libs/billing/src/usageCollector.ts

export interface UsageEvent {
  usage_id: string;
  customer_id: string;
  timestamp: string;
  
  metric_type: 'minutes_broadcast' | 'reporters_active' | 'storage_gb' | 'api_calls';
  metric_value: number;
  
  billing_period: string;  // YYYY-MM
  
  cost_cents: number;  // Cost for this unit
}

export class UsageCollector {
  async recordUsage(event: UsageEvent): Promise<void> {
    // Write to usage table
    await this.db.usage.insert(event);
    
    // Publish to billing queue
    await this.eventBus.publish('billing.usage_recorded', event);
    
    // Check for overage
    const currentUsage = await this.getCurrentMonthUsage(event.customer_id, event.metric_type);
    const license = await this.licenseManager.validateLicense(event.customer_id);
    
    const limit = this.getLimit(license.tier, event.metric_type);
    if (currentUsage > limit) {
      // Trigger overage billing
      await this.recordOverage(event.customer_id, event.metric_type, currentUsage - limit);
    }
  }
}
```

### Billing Events (Published to Event Bus)

```typescript
// Broadcast started → record minutes
eventBus.on('broadcast.started', async (event) => {
  await usageCollector.recordUsage({
    usage_id: generateUUID(),
    customer_id: event.data.customer_id,
    timestamp: new Date().toISOString(),
    metric_type: 'minutes_broadcast',
    metric_value: 1,  // 1 minute per event, will be aggregated
    billing_period: getBillingPeriod(),
    cost_cents: 10,  // $0.10 per minute
  });
});

// Reporter joined → record active reporter
eventBus.on('media.participant_joined', async (event) => {
  const activeReporters = await countActiveReporters(event.data.broadcast_id);
  await usageCollector.recordUsage({
    usage_id: generateUUID(),
    customer_id: event.data.customer_id,
    timestamp: new Date().toISOString(),
    metric_type: 'reporters_active',
    metric_value: activeReporters,
    billing_period: getBillingPeriod(),
    cost_cents: 0,  // Counted in broadcast minutes
  });
});
```

---

## 11. Service Discovery

### Pattern: Consul

```yaml
# services/platform-core/consul/consul.hcl
datacenter = "telemab-primary"
node_name = "consul-server"

server = true
ui = true

bootstrap_expect = 1

client_addr = "0.0.0.0"
bind_addr = "0.0.0.0"
advertise_addr = "consul"

ports {
  dns = 8600
  http = 8500
  serf_lan = 8301
  serf_wan = 8302
  server = 8300
}
```

### Service Registration

```typescript
// services/platform-core/libs/discovery/src/serviceRegistry.ts

export class ServiceRegistry {
  constructor(private consul: ConsulClient) {}

  async registerService(config: ServiceConfig): Promise<void> {
    await this.consul.agent.service.register({
      id: config.serviceId,
      name: config.serviceName,
      address: config.address,
      port: config.port,
      tags: config.tags || ['telemab'],
      check: {
        http: `http://${config.address}:${config.port}/health`,
        interval: '10s',
        timeout: '5s',
        deregister_critical_service_after: '30s',
      },
    });

    this.logger.info('Service registered', {
      service_id: config.serviceId,
      service_name: config.serviceName,
      address: `${config.address}:${config.port}`,
    });
  }

  async discover(serviceName: string): Promise<ServiceInstance[]> {
    const services = await this.consul.health.service({
      service: serviceName,
      passing: true,
    });

    return services.map(service => ({
      id: service.Service.ID,
      name: service.Service.Service,
      address: service.Service.Address,
      port: service.Service.Port,
      healthy: true,
    }));
  }
}
```

### DNS for Service Discovery

```bash
# Services can discover each other via DNS
# Example: auth-service.service.consul

curl http://auth-service.service.consul:3001/health

# Or programmatically:
const authService = await serviceRegistry.discover('auth-service');
const url = `http://${authService[0].address}:${authService[0].port}`;
```

---

## Platform Core Docker Compose

```yaml
# docker-compose.platform.yml

version: '3.8'

services:
  # API Gateway
  kong:
    image: kong:3.4-alpine
    environment:
      KONG_DATABASE: postgres
      KONG_PG_HOST: postgres
      KONG_PROXY_ACCESS_LOG: /dev/stdout
    ports:
      - "8000:8000"
      - "8001:8001"
    depends_on:
      - postgres

  # Authentication
  auth-service:
    build: ./services/auth-service
    environment:
      SERVICE_NAME: auth-service
      API_PORT: 3001
      DB_HOST: postgres
      REDIS_HOST: redis
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis

  # Configuration & Secrets
  vault:
    image: vault:1.15
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: "${VAULT_TOKEN}"
    ports:
      - "8200:8200"
    cap_add:
      - IPC_LOCK

  # Service Discovery
  consul:
    image: consul:1.16
    ports:
      - "8500:8500"
      - "8600:8600/udp"
    command: agent -server -ui -bootstrap-expect=1 -client=0.0.0.0

  # Event Bus
  rabbitmq:
    image: rabbitmq:3.12-management
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672:5672"
      - "15672:15672"

  # Data Layer
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: telemab
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # Monitoring
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"

  # Logging
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    environment:
      - discovery.type=single-node
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:8.0.0
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
      ELASTICSEARCH_USERNAME: elastic
      ELASTICSEARCH_PASSWORD: ${ELASTIC_PASSWORD}
    ports:
      - "5601:5601"

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
  elasticsearch_data:

networks:
  default:
    name: platform
    driver: bridge
```

---

## Shared Libraries Structure

```
services/
├── platform-core/
│   └── libs/
│       ├── auth/
│       │   ├── src/
│       │   │   ├── authService.ts
│       │   │   ├── middleware/
│       │   │   ├── models/
│       │   │   └── index.ts
│       │   ├── tests/
│       │   ├── package.json
│       │   └── tsconfig.json
│       │
│       ├── events/
│       │   ├── src/
│       │   │   ├── eventPublisher.ts
│       │   │   ├── eventConsumer.ts
│       │   │   ├── eventTypes.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── config/
│       │   ├── src/
│       │   │   ├── configLoader.ts
│       │   │   ├── types.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── logging/
│       │   ├── src/
│       │   │   ├── logger.ts
│       │   │   ├── middleware.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── monitoring/
│       │   ├── src/
│       │   │   ├── metrics.ts
│       │   │   ├── middleware.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── secrets/
│       │   ├── src/
│       │   │   ├── secretsManager.ts
│       │   │   ├── vaultClient.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── audit/
│       │   ├── src/
│       │   │   ├── auditLogger.ts
│       │   │   ├── middleware.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── licensing/
│       │   ├── src/
│       │   │   ├── licenseManager.ts
│       │   │   ├── middleware.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── billing/
│       │   ├── src/
│       │   │   ├── usageCollector.ts
│       │   │   ├── models.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       ├── discovery/
│       │   ├── src/
│       │   │   ├── serviceRegistry.ts
│       │   │   ├── consulClient.ts
│       │   │   └── index.ts
│       │   └── package.json
│       │
│       └── database/
│           ├── src/
│           │   ├── pool.ts
│           │   ├── migrations.ts
│           │   └── index.ts
│           └── package.json
│
├── auth-service/
├── reporter-service/
├── media-service/
└── ... (all 13 business services)
```

---

## Service Integration Example

Every service uses Platform Core the same way:

```typescript
// services/reporter-service/src/index.ts

import express from 'express';
import { loadConfig } from '@platform/config';
import { authMiddleware } from '@platform/auth';
import { loggingMiddleware, Logger } from '@platform/logging';
import { metricsMiddleware, MetricsCollector } from '@platform/monitoring';
import { auditMiddleware } from '@platform/audit';
import { EventPublisher } from '@platform/events';
import { LicenseManager } from '@platform/licensing';
import { ServiceRegistry } from '@platform/discovery';

const config = loadConfig();
const app = express();

// Platform Core middleware (identical across all services)
app.use(loggingMiddleware);
app.use(metricsMiddleware(new MetricsCollector()));
app.use(authMiddleware(authServiceClient));
app.use(auditMiddleware);

// Service-specific code
const reporterService = new ReporterService(
  db,
  new EventPublisher(amqp),
  new LicenseManager(redis)
);

// Routes
app.get('/reporters/v1', async (req, res) => {
  const reporters = await reporterService.listReporters();
  res.json(reporters);
});

app.post('/reporters/v1', async (req, res) => {
  const reporter = await reporterService.createReporter(req.body);
  res.status(201).json(reporter);
});

// Health check (required by service discovery)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'reporter-service' });
});

// Metrics endpoint (scraped by Prometheus)
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(prometheus.register.metrics());
});

// Register with service discovery
const registry = new ServiceRegistry(consulClient);
await registry.registerService({
  serviceId: 'reporter-service-1',
  serviceName: 'reporter-service',
  address: 'reporter-service',
  port: 3002,
  tags: ['v1', 'api'],
});

app.listen(config.apiPort, () => {
  console.log(`Reporter Service listening on ${config.apiPort}`);
});
```

---

## Single-Node vs. Multi-Node Deployment

### Development (Single-Node)

```yaml
# docker-compose.dev.yml
# Everything runs on localhost
# All 13 services + infrastructure in one compose file
services:
  kong:
    ports:
      - "8000:8000"
  auth-service:
    ports:
      - "3001:3001"
  reporter-service:
    ports:
      - "3002:3002"
  # ... all services
  postgres:
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
  rabbitmq:
    volumes:
      - ./data/rabbitmq:/var/lib/rabbitmq
```

**Key:** No code changes needed. Same code runs locally and in production.

### Production (Multi-Node)

```yaml
# kubernetes/telemab-platform/
# All 13 services as separate deployments
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reporter-service
spec:
  replicas: 3  # Scale independently
  template:
    spec:
      containers:
        - name: reporter-service
          image: telemab/reporter-service:latest
          env:
            - name: SERVICE_NAME
              value: reporter-service
            - name: API_PORT
              value: "3002"
            - name: DB_HOST
              value: postgres.default.svc.cluster.local  # Kubernetes DNS
            - name: REDIS_HOST
              value: redis.default.svc.cluster.local
            - name: RABBITMQ_URL
              value: amqp://rabbitmq.default.svc.cluster.local:5672
```

**Key:** Same code. Different environment variables. Kubernetes handles routing.

---

## Summary: Platform Core Principles

✅ **Single Source of Truth** - All services use same auth, logging, monitoring  
✅ **No Duplication** - Each capability implemented once  
✅ **Consistent APIs** - All error handling, formats identical  
✅ **Observable by Default** - Every request traced end-to-end  
✅ **Secure by Default** - All APIs require JWT, audit-logged  
✅ **License-Aware** - Feature gates work transparently  
✅ **Scalable** - Shared infrastructure supports all services  
✅ **Development-Friendly** - Single docker-compose for local development  
✅ **Production-Ready** - Kubernetes manifests for cloud deployment  

---

**Platform Core is ready for implementation.**

**Next: Build the first 3 services (Auth, Reporter, Media) on top of this foundation.**
