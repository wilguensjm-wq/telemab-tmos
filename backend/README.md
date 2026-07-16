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
- Provider integrations that are not yet connected return normalized operational responses instead of raw `404` responses.
- Unavailable integrations return:
	- HTTP `503`
	- `error.code = PROVIDER_UNAVAILABLE`
	- `error.message = Live connection not configured`
	- `error.details.integration` and `error.details.endpoint` for diagnostics.

This keeps API behavior predictable while enforcing the rule that no mock, synthetic, or fabricated data should be returned for unavailable providers.
