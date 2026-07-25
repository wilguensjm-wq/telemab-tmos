# TMOS Engineering Standards

Status: Approved
Last updated: 2026-07-13

## 1. Product Architecture

TMOS Backend is the system of record and the only gateway to infrastructure providers.

### Backend owns
- Authentication
- RBAC and authorization policy enforcement
- Provider communication
- Provider orchestration
- Audit logging
- TMOS Event Bus publication and retrieval
- Error normalization
- Provider health checks
- API versioning
- Caching

### Frontend owns
- Presentation and visualization
- User interaction and operator workflows
- Client state management
- Rendering TMOS data returned by backend APIs

### Mandatory flow
Frontend -> TMOS Backend API -> Provider SDK -> Provider APIs

The frontend must never call provider APIs directly.

## 2. API Conventions

### Versioning
- All production APIs must be namespaced: `/api/v1/...`
- Backward compatibility must be explicit and temporary.

### Response envelope
All successful responses must follow:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "correlationId": "...",
    "timestamp": "..."
  }
}
```

All failed responses must follow:

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "Provider request timed out",
    "details": {}
  },
  "meta": {
    "correlationId": "...",
    "timestamp": "..."
  }
}
```

## 3. Provider SDK (Required)

Every provider implementation must conform to one common interface.

```ts
interface Provider {
  connect(): Promise<void>;
  health(): Promise<ProviderHealth>;
  status(resourceId?: string): Promise<ProviderStatus>;
  metrics(resourceId?: string): Promise<ProviderMetrics>;
  start(resourceId: string, options?: Record<string, unknown>): Promise<ActionResult>;
  stop(resourceId: string, options?: Record<string, unknown>): Promise<ActionResult>;
  restart(resourceId: string, options?: Record<string, unknown>): Promise<ActionResult>;
  logs(resourceId?: string, options?: Record<string, unknown>): Promise<ProviderLog[]>;
  events(options?: Record<string, unknown>): Promise<ProviderEvent[]>;
  capabilities(): ProviderCapabilities;
}
```

Sprint 1 registration targets:
- ProxmoxProvider
- DockerProvider
- PortainerProvider
- UptimeKumaProvider
- NginxProxyManagerProvider

Only ProxmoxProvider is implemented fully in Sprint 1. Others can be scaffolds returning `not_implemented` with normalized envelopes.

## 4. TMOS Event Schema (Required)

All provider and system events must use:

```json
{
  "id": "evt-...",
  "timestamp": "2026-07-13T00:00:00.000Z",
  "provider": "proxmox",
  "resource": "vm-101",
  "action": "start",
  "severity": "info",
  "status": "acknowledged",
  "operator": "alice",
  "correlationId": "req-...",
  "metadata": {}
}
```

### Event rules
- `correlationId` is required and propagated across request, provider calls, audit, and events.
- `severity` enum: `info | warning | critical`.
- `status` enum: `open | acknowledged | resolved | failed`.

## 5. Audit Schema (Required)

Audit records must be backend-generated and immutable.

```json
{
  "id": "aud-...",
  "timestamp": "2026-07-13T00:00:00.000Z",
  "actor": "alice",
  "action": "infrastructure.startVm",
  "target": "vm-101",
  "result": "success",
  "provider": "proxmox",
  "correlationId": "req-...",
  "metadata": {}
}
```

## 6. Error Handling Standard

### Goals
- Never leak provider secrets or raw stack traces.
- Normalize provider errors into TMOS error codes.

### Minimum normalized codes
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_FORBIDDEN`
- `RBAC_DENIED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_TIMEOUT`
- `PROVIDER_BAD_RESPONSE`
- `VALIDATION_ERROR`
- `INTERNAL_ERROR`

## 7. Caching and Health

### Caching
- Read endpoints may use TTL cache.
- Action endpoints must never return stale action state as final truth.

### Health checks
- Provide `/api/v1/health` and provider-level health summaries.
- Provider health failures must emit TMOS warning/critical events.

## 8. Security and Secrets

- Provider credentials are backend-only.
- No provider token, API key, or password in frontend bundles.
- Use environment variables or secret manager in backend runtime.
- Enforce auth + RBAC before provider actions.

## 9. Development Workflow

For every sprint task:
1. Review this document and current architecture.
2. Identify duplication/conflicts before coding.
3. Publish a concise implementation plan.
4. Implement smallest maintainable change set.
5. Validate with build/test/runtime evidence.
6. Report changed files, behavior, risks, and technical debt.

Major refactors require design rationale and approval first.

## 10. Sprint 1 Definition (Backend Foundation)

Sprint 1 proves architecture using Proxmox end-to-end.

Required outcomes:
- Authenticate via backend
- Retrieve live Proxmox data via backend gateway
- Execute VM actions via backend
- Record audit logs in backend
- Publish TMOS events in common schema
- Return normalized API responses and errors
- Frontend updates from backend data and events

Non-goals:
- Frontend redesign
- New frontend pages
- Full implementation of all providers in one sprint

## 11. Acceptance Gate

No sprint is complete unless evidence includes:
- API contract validation
- Action success and failure evidence
- Audit record evidence
- Event publication evidence
- Correlation ID traceability across request -> provider -> audit -> event

## 12. Integration Planning Gate

Before implementing any provider connector, publish a short integration plan and complete one integration fully before moving to the next.

Required plan fields:
- External service name
- Authentication method (API token, SSH key, username/password, etc.)
- Backend endpoint(s) to expose
- Frontend pages/modules that consume those endpoints
- Required environment variables (names only, no secrets)

Execution rule:
- Implement one connector end-to-end (backend provider, routes, envelope/error behavior, frontend consumption, verification evidence) before starting another connector.

## 13. Authentication Failure Isolation Gate

If a provider returns 401 or 403, do not conclude the provider is at fault until the request has been verified against official provider API documentation and the TMOS request format has been validated.

Required evidence for any 401 or 403:
- Connectivity proof to provider host and port.
- Authentication header/cookie format proof against official documentation.
- Side-by-side comparison of:
  - TMOS exact request format
  - Intentionally malformed auth format
  - Intentionally invalid credential/token value
- Endpoint-by-endpoint status results for required integration paths.
- Clear conclusion whether failure is in:
  - TMOS request construction
  - Credential/token value
  - Permission scope
  - Provider availability.

Progression rule:
- Do not proceed to the next connector until auth-stage root cause is isolated with evidence and live provider data is returned through TMOS.

## 14. Stability First Policy (Current Program Phase)

TMOS is in Stability Validation Mode.

Mandatory rule:
- No new feature development is allowed until the stability milestone passes.

Priority order:
1. Stability
2. Reliability
3. Security
4. Cross-device compatibility
5. Performance
6. New features

Feature freeze scope (until milestone pass):
- No UI redesigns.
- No new broadcast features.
- No additional workflow features.
- No Program Switcher enhancements beyond bug fixes.
- No Reporter feature expansion.

Allowed work during freeze:
- Bug fixes
- Stability improvements
- Deployment hardening
- Production validation and evidence collection

Stability success criteria for Reporter contribution layer readiness:
- Reporters can connect from public internet networks.
- No dependency on localhost, private IPs, VPNs, or office LAN for reporter connectivity.
- Multiple reporters remain connected simultaneously.
- Camera and microphone remain stable during extended sessions.
- Automatic reconnection succeeds after temporary network interruption.
- Producer receives consistent audio and video from all active reporters.
- Memory usage remains stable during extended operation.
- No critical frontend or backend errors occur.
- Supported browsers and devices pass validation.

Completion rule:
- Only after all stability evidence passes may Reporter contribution be marked Version 1.0 Stable and feature development resume for Program Switcher/Broadcast workflow expansion.
