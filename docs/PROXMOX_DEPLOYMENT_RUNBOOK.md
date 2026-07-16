# Proxmox Deployment Runbook

Status: Ready for infrastructure handoff
Scope: Credential provisioning and production verification for TMOS Proxmox Integration 1

## Purpose

This runbook documents the provider-side steps required to unblock TMOS Proxmox integration when backend connectivity works but API token authentication fails.

## Current Blocker

- TMOS reaches the Proxmox API host successfully.
- TMOS sends the documented `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID` header format.
- Proxmox currently returns `401 Authentication failed!` for direct calls to required read endpoints.
- Integration status remains: `Blocked - Waiting for Infrastructure Credentials`.

## Required Proxmox Configuration

Create or verify an API token for the intended Proxmox user and configure it in TMOS backend environment.

### Required environment variables

- `PROXMOX_ENABLED=true`
- `PROXMOX_URL=https://<proxmox-host>:8006`
- `PROXMOX_TOKEN_ID=<user@realm!tokenid>`
- `PROXMOX_TOKEN_SECRET=<token-secret>`
- `PROXMOX_TLS_STRICT=true|false`

### Recommended minimum access

Grant read access sufficient to retrieve:

- version
- nodes
- VMs
- storage
- tasks
- logs

For VM action support, add the required VM power permissions separately.

## Provider Verification Steps

Run these direct checks against Proxmox before validating TMOS:

```bash
AUTH_HEADER="Authorization: PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}"

curl -k -H "$AUTH_HEADER" "${PROXMOX_URL}/api2/json/version"
curl -k -H "$AUTH_HEADER" "${PROXMOX_URL}/api2/json/nodes"
curl -k -H "$AUTH_HEADER" "${PROXMOX_URL}/api2/json/cluster/resources?type=vm"
curl -k -H "$AUTH_HEADER" "${PROXMOX_URL}/api2/json/cluster/resources?type=storage"
curl -k -H "$AUTH_HEADER" "${PROXMOX_URL}/api2/json/cluster/tasks?limit=5"
```

Expected result: all requests return HTTP `200` with real provider data.

## TMOS Verification Steps

After updating backend credentials, verify TMOS backend responses:

```bash
LOGIN_JSON=$(curl -sS -X POST http://127.0.0.1:8081/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"operator","password":"operator"}')

TOKEN=$(echo "$LOGIN_JSON" | node -e 'const fs=require("fs");const s=fs.readFileSync(0,"utf8");const j=JSON.parse(s);process.stdout.write((j.data&&j.data.accessToken)||"")')

curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8081/api/infrastructure/proxmox/vms
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8081/api/infrastructure/proxmox/alerts
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8081/api/infrastructure/proxmox/logs
```

Expected result:

- `/api/infrastructure/proxmox/vms` returns live VM inventory.
- `/api/infrastructure/proxmox/alerts` returns live task or alert data.
- `/api/infrastructure/proxmox/logs` returns live log data.

## UI Acceptance Gate

The Proxmox UI page must show only live production information:

- live VM rows
- live node or infrastructure status
- live storage or task-derived operational data where available
- no mock, placeholder, or synthetic values

If provider authentication fails or provider connectivity is unavailable, UI must show `Live connection not configured` or a clear operational error and must not invent data.

## Done Criteria

Do not mark Proxmox complete until all of the following pass:

- `GET /api2/json/version` returns `200`
- `GET /api2/json/nodes` returns `200`
- `GET /api2/json/cluster/resources?type=vm` returns `200`
- `GET /api2/json/cluster/resources?type=storage` returns `200`
- `GET /api2/json/cluster/tasks` returns `200`
- TMOS proxmox endpoints return real provider data
- TMOS Proxmox UI renders live production values only

## Sequencing Rule

Do not begin Ubuntu, Docker, Portainer, or any other provider integration until Proxmox satisfies the full production acceptance gate.