# TMOS Backend Design Blueprint

This backend design package outlines a PostgreSQL-ready architecture for TMOS Enterprise Edition.
It is intended for future Express or NestJS implementation and is kept independent from the existing frontend UI.

## Architecture Goals
- Modular service-oriented design
- PostgreSQL-compatible schema definitions
- OpenAPI-ready endpoint contracts
- Validation-ready request and response models
- Auth and authorization compatibility
- Future-ready for real-time broadcast workflows

## Runtime API Contract (Current)

- Authentication and Proxmox endpoints are active and wired through `/api/v1` with temporary `/api` compatibility aliases.
- Phase 1 persistence is active with PostgreSQL repositories for users, sessions, events, audit logs, configuration, and provider state.
- Database migrations are applied automatically at startup and can also be run manually with `npm run migrate`.
- Provider integrations that are not yet connected return normalized operational responses instead of raw `404` responses.
- Unavailable integrations return:
	- HTTP `503`
	- `error.code = PROVIDER_UNAVAILABLE`
	- `error.message = Live connection not configured`
	- `error.details.integration` and `error.details.endpoint` for diagnostics.

This keeps API behavior predictable while enforcing the rule that no mock, synthetic, or fabricated data should be returned for unavailable providers.

## Database Environment

- `TMOS_DATABASE_URL` PostgreSQL connection string.
- `TMOS_DATABASE_SSL` Enable TLS for database transport.
- `TMOS_DATABASE_MAX_POOL` Maximum pool size.
- `TMOS_DATABASE_IDLE_TIMEOUT_MS` Idle timeout for pooled connections.
- `TMOS_DATABASE_REQUIRED` When true, startup fails if database config or connectivity is missing.

Phase 1 production rule: runtime memory fallback is not used in production paths. PostgreSQL is required as the active system of record.
