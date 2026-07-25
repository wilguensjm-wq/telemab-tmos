# TeleMab Broadcast Platform - TMOS v2.0

**Enterprise-Grade Service-Oriented Broadcast Platform**

## Overview

TMOS 2.0 is a complete redesign of the TeleMap Operating System as a modern, scalable Service-Oriented Architecture (SOA). It provides enterprise broadcasting capabilities through 13 independent microservices, each focused on a specific domain.

## Quick Start

See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) for detailed setup and development instructions.

### 60-Second Start

```bash
# 1. Install dependencies
npm install

# 2. Start TMOS app stack (frontend + backend + postgres + livekit)
npm run dev:tmos

# 3. Check health
npm run dev:tmos:status

# 4. Access services
# - Frontend: http://localhost:5173
# - Backend: http://localhost:8081/api/v1/health
```

## Architecture Highlights

### 13 Independent Services
- **Auth Service** - User authentication & session management ✅
- **Reporter Service** - Broadcast control & reporter interface (coming)
- **Media Service** - LiveKit/Janus/MediaSoup abstraction layer (coming)
- **Producer Control Service** - Producer command center (coming)
- **Streaming Service** - Stream management & delivery (coming)
- **Recording Service** - Session recording & archiving (coming)
- **Asset Service** - Media asset management (coming)
- **AI Service** - AI-powered features (coming)
- **Notification Service** - Alerts & notifications (coming)
- **Analytics Service** - Platform analytics (coming)
- **Monitoring Service** - Performance monitoring (coming)
- **Admin Service** - Platform administration (coming)
- **Licensing Service** - Feature licensing (coming)

### Platform Core Libraries (@platform/*)
- ✅ **config** - Centralized configuration management
- ✅ **auth** - JWT authentication & authorization
- ✅ **logging** - Structured logging with correlation IDs
- ✅ **events** - RabbitMQ event publishing & consumption
- ✅ **monitoring** - Prometheus metrics collection
- 🔄 **secrets** - Secrets management (Vault integration)
- 🔄 **audit** - Immutable audit trail
- 🔄 **database** - Connection pooling & migrations
- 🔄 And 3 more shared capabilities

### Infrastructure Stack
- **PostgreSQL 16** - Primary data store with RBAC
- **Redis 7** - Session caching & fast lookups
- **RabbitMQ 3.12** - Event bus for asynchronous messaging
- **Consul 1.16** - Service discovery & health checks
- **Prometheus** - Metrics collection & monitoring
- **Grafana** - Visualization & dashboards
- **Kong 3.4** - API Gateway (production)
- **Elasticsearch/ELK** - Centralized logging (production)

## Project Status

### ✅ Completed (This Session)

- [x] Root monorepo structure with npm workspaces
- [x] All 11 Platform Core libraries implemented
- [x] Auth Service with JWT, MFA support, session management
- [x] PostgreSQL schema with RBAC and audit tables
- [x] Docker Compose development stack (postgres, redis, rabbitmq, consul, prometheus, grafana)
- [x] Auth Service Docker image with multi-stage builds
- [x] Prometheus metrics collection & configuration
- [x] Structured logging with correlation IDs
- [x] TypeScript strict mode across all services
- [x] Development tooling (Makefile, eslint, prettier, jest)

### 🔄 In Progress

- [ ] Reporter Service implementation
- [ ] Media Service abstraction layer
- [ ] Producer Control Service
- [ ] End-to-end integration tests
- [ ] Kubernetes deployment manifests
- [ ] CI/CD pipeline (GitHub Actions)

### 📋 Planned (Remaining Services)

- [ ] Streaming Service
- [ ] Recording Service
- [ ] Asset Service
- [ ] AI Service
- [ ] Notification Service
- [ ] Analytics Service
- [ ] Monitoring Service
- [ ] Admin Service
- [ ] Licensing Service

## Development Commands

```bash
# Setup & Build
make install          # Install all dependencies
make build            # Build all services
make clean            # Clean build artifacts

# Development
make dev              # Start infrastructure stack
make dev-logs         # View service logs
make dev-restart      # Restart infrastructure
make dev-stop         # Stop infrastructure

# Code Quality
make lint             # Lint all code
make format           # Format all code
make test             # Run all tests

# Utilities
make status           # Check service health
make db-shell         # PostgreSQL shell
make redis-cli        # Redis CLI
make auth-service-dev # Run Auth Service in dev mode
```

## Key Features

### Security-First Architecture
- JWT tokens with configurable expiry
- Role-based access control (RBAC)
- Database-level security with row-level policies
- Secrets management via HashiCorp Vault
- Immutable audit trail for compliance

### Observability Built-In
- Structured JSON logging with correlation IDs
- Prometheus metrics on every endpoint
- Distributed tracing via Jaeger
- Centralized log aggregation (ELK)
- Service health checks & readiness probes

### Developer Experience
- Monorepo with npm workspaces for easy dependency management
- Shared TypeScript types across services
- Hot reload in development mode (ts-node)
- Docker Compose for local development
- Database migrations with version control
- Comprehensive Makefile commands

### Scalability
- Stateless services for horizontal scaling
- Event-driven architecture via message bus
- Database-per-service pattern
- API Gateway for request routing & rate limiting
- Kubernetes-ready container architecture

## Architecture Documentation

Comprehensive documentation is available in the `docs/` directory:

1. **[TELEMAB_BROADCAST_PLATFORM_SOA.md](docs/TELEMAB_BROADCAST_PLATFORM_SOA.md)** (60 pages)
   - Complete SOA specification with 13 services
   - OpenAPI 3.0 contracts for every endpoint
   - Event schemas and routing patterns
   - Database schema designs
   - Security architecture

2. **[PLATFORM_CORE_ARCHITECTURE.md](docs/PLATFORM_CORE_ARCHITECTURE.md)** (comprehensive)
   - Detailed design of 11 shared capabilities
   - Middleware patterns
   - Configuration strategies
   - Integration examples

3. **[SOA_IMPLEMENTATION_ROADMAP.md](docs/SOA_IMPLEMENTATION_ROADMAP.md)** (40 pages)
   - 24-week implementation timeline
   - Phase breakdown with milestones
   - Team structure & budget
   - Risk analysis

4. **[STRATEGIC_VISION_SOA_V2.md](docs/STRATEGIC_VISION_SOA_V2.md)** (35 pages)
   - Market opportunity & competitive analysis
   - Revenue projections
   - Go-to-market strategy
   - 5-year financial model

5. **[EXECUTIVE_SUMMARY_SOA_V2.md](docs/EXECUTIVE_SUMMARY_SOA_V2.md)** (25 pages)
   - Executive decision framework
   - Path A/B/C analysis
   - Risk-adjusted financials
   - Leadership FAQs

## Engineering Standards

All development follows standards defined in [docs/TMOS_ENGINEERING_STANDARDS.md](docs/TMOS_ENGINEERING_STANDARDS.md):

- Backend-only gateway architecture
- Shared provider interfaces
- Event-driven communication
- Database-per-service isolation
- Comprehensive testing requirements
- Production-ready code only (no TODOs)

## Deployment

### Development
```bash
docker-compose -f docker-compose.dev.yml up
```

### Production
See [docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md](docs/PRODUCTION_DEPLOYMENT_ARCHITECTURE.md) for:
- Kubernetes deployment manifests
- Multi-region architecture
- High availability setup
- Database replication
- Load balancing configuration

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm test -- --testMatch='**/*.integration.test.ts'

# E2E tests (when implemented)
npm run test:e2e
```

## Contributing

1. Create a feature branch
2. Implement changes following [TMOS_ENGINEERING_STANDARDS.md](docs/TMOS_ENGINEERING_STANDARDS.md)
3. Add tests for all new functionality
4. Ensure `npm run lint:all` and `npm run test:all` pass
5. Submit pull request

## Support

For issues, questions, or contributions:
- Check [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) for setup help
- Review architecture docs for design questions
- File issues on GitHub with reproduction steps

## Version History

- **2.0.0** (Current) - SOA redesign with 13 services, Platform Core libraries
- **1.0.0** - Original monolithic Reporter Portal
- **0.6.0** - Broadcast engine validation complete
- **0.4.0** - LiveKit infrastructure deployed

## License

Proprietary - TeleMab Inc.

---

**Status:** ✅ Implementation Phase Active
**Last Updated:** $(date)
**Next Milestone:** Reporter Service (Week 2)

TMOS 2.0
- Reporter Control
- Newsroom

TMOS 3.0
- Playlist Automation
- Broadcast Control

TMOS 4.0
- AI Suite

TMOS 5.0
- Enterprise Platform

---

© 2026 TeleMap TV.
All Rights Reserved.

TMOS™ is proprietary software developed by TeleMap TV.
Unauthorized reproduction or distribution is prohibited.
