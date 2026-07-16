# Integration Plan: Proxmox

Status: Blocked - Waiting for Infrastructure Credentials
Order: 1 of N

## External Service
- Proxmox VE API

## Authentication Method
- Proxmox API token via `PVEAPIToken=<token_id>=<token_secret>` header
- TLS verification controlled by environment configuration

## Backend Endpoints To Expose
- GET /api/v1/providers/proxmox/vms
- GET /api/v1/providers/proxmox/vms/:vmId
- GET /api/v1/providers/proxmox/vms/:vmId/metrics
- GET /api/v1/providers/proxmox/logs
- GET /api/v1/infrastructure/proxmox/vms
- GET /api/v1/infrastructure/proxmox/logs
- GET /api/v1/infrastructure/proxmox/alerts
- POST /api/v1/infrastructure/proxmox/vms/start
- POST /api/v1/infrastructure/proxmox/vms/stop
- POST /api/v1/infrastructure/proxmox/vms/reboot

## Frontend Consumers
- pages/SystemHealth.jsx (Proxmox module view)
- providers/adapters/ProxmoxAdapter.js
- services/infrastructureIntegrationService.js
- services/dashboardService.js

## Required Environment Variables
- TMOS_PROVIDER_TIMEOUT_MS
- PROXMOX_ENABLED
- PROXMOX_URL
- PROXMOX_TOKEN_ID
- PROXMOX_TOKEN_SECRET
- PROXMOX_TLS_STRICT
- PROXMOX_VMS_PATH
- PROXMOX_ALERTS_PATH
- PROXMOX_LOGS_PATH
- PROXMOX_START_PATH
- PROXMOX_STOP_PATH
- PROXMOX_RESTART_PATH

## Notes
- If Proxmox is not configured, backend returns normalized 503 (`PROVIDER_UNAVAILABLE`) and frontend renders "Live connection not configured".
- No synthetic metrics or fabricated resources are generated.
- Frontend consumes Proxmox operational data through backend gateway endpoints only.

## Verified Findings
- TMOS successfully reaches the configured Proxmox server at `https://192.168.88.10:8006`.
- TMOS constructs the `Authorization: PVEAPIToken=...` header in the documented Proxmox format.
- Direct Proxmox API requests to `/api2/json/version`, `/api2/json/nodes`, `/api2/json/cluster/resources?type=vm`, `/api2/json/cluster/resources?type=storage`, and `/api2/json/cluster/tasks` return `401 Authentication failed!`.
- TMOS correctly maps the upstream authentication failure to `AUTH_FORBIDDEN` on `/api/infrastructure/proxmox/*`.

## Current Conclusion
- The failure occurs during authentication with Proxmox before any application data can be retrieved.
- This places the active blocker upstream of TMOS UI rendering and route wiring.
- Current evidence supports one of these causes:
  - incorrect token ID
  - incorrect token secret
  - token revoked, disabled, or expired
  - token created under a different user or realm than configured

## Blocker
- Provider-side administrative access is required to verify or regenerate the Proxmox API token.
- TMOS work on Proxmox should remain paused until valid credentials are supplied by the infrastructure administrator.
- Use [docs/PROXMOX_DEPLOYMENT_RUNBOOK.md](/home/telemab/docker/tmos/docs/PROXMOX_DEPLOYMENT_RUNBOOK.md) for the infrastructure handoff and post-credential verification sequence.

## Completion Criteria
After the Proxmox token is corrected, re-run verification and do not mark this connector production-ready until all checks pass:
- `/api2/json/version` returns `200`.
- `/api2/json/nodes` returns live node data.
- `/api2/json/cluster/resources?type=vm` returns live VM data.
- `/api2/json/cluster/resources?type=storage` returns live storage data.
- `/api2/json/cluster/tasks` returns live task data.
- TMOS `/api/infrastructure/proxmox/*` endpoints return real provider data.
- The Proxmox page displays actual VMs, storage, and node status with no placeholder or fabricated values.
