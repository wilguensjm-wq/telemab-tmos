# Phase 3.2 WebSocket Event Contract

Path: `/api/v1/presence/ws`
Authentication: JWT access token (`Authorization: Bearer <token>` or `?token=<token>`)

## Server -> Client Events

- `presence.connected`
  - payload:
    - `sessionId`
    - `user` (`id`, `username`, `role`)
    - `permissions` (`read`, `update`, `override`)
    - `heartbeatIntervalMs`
    - `timestamp`

- `presence.snapshot`
  - payload:
    - `reason` (`initial`, `presence.heartbeat`, `presence.timeout`, `presence.override`, etc.)
    - `data` (array of presence rows)
    - `timestamp`

- `presence.server.ping`
  - payload:
    - `timestamp`

- `presence.heartbeat.ack`
  - payload:
    - `timestamp`

- `presence.override.ack`
  - payload:
    - `data` (updated presence row)

- `presence.error`
  - payload:
    - `code` (`AUTH_FORBIDDEN`, `RBAC_DENIED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`)
    - `message`

## Client -> Server Events

- `presence.heartbeat`
  - required permission: `presence.update`
  - payload fields:
    - `reporterId`
    - `connectionStatus`
    - `currentAssignmentId`
    - `currentStudioId`
    - `deviceType`
    - `operatingSystem`
    - `appVersion`
    - `cameraReady`
    - `microphoneReady`
    - `speakerReady`
    - `internetQuality`
    - `signalStrength`
    - `batteryLevel`
    - `isCharging`

- `presence.override`
  - required permission: `presence.override`
  - payload fields:
    - `reporterId`
    - any mutable presence fields from `presence.heartbeat`

## Runtime Rules

- Client heartbeat cadence: every 10 seconds.
- Presence timeout: stale connected sessions are marked `Disconnected` when heartbeats are missed past timeout threshold.
- Reconnect: client is expected to reconnect automatically and re-establish heartbeat flow.
- Broadcast: snapshot updates are sent only to clients that have `presence.read`.

## Security and Audit

- All websocket sessions are token-authenticated.
- Permission checks are enforced per message type.
- Presence lifecycle and overrides are audited through backend `audit_logs`.
