# Phase 3.2 Live Validation Report

Date: 2026-07-17
Status: Pass

## Objective

Validate realtime presence behavior in a running TMOS stack before starting Phase 3.3 media features.

## Environment

- Backend: `TMOS_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/tmos`
- API base: `http://127.0.0.1:8081/api/v1`
- WebSocket: `ws://127.0.0.1:8081/api/v1/presence/ws`

## Validation Scenarios and Results

1. Reporter connects
- Result: PASS
- Evidence: websocket `presence.connected` observed for reporter session.

2. JWT authentication succeeds
- Result: PASS
- Evidence: producer websocket authenticated and connected with token.

3. Heartbeats are received
- Result: PASS
- Evidence: reporter websocket received `presence.heartbeat.ack`.

4. Producer sees reporter appear
- Result: PASS
- Evidence: producer websocket received `presence.snapshot` containing the reporter with active status.

5. Reporter disconnects
- Result: PASS
- Evidence: presence REST detail endpoint returned `connectionStatus=Disconnected` after socket close.

6. Heartbeat timeout marks reporter offline
- Result: PASS
- Evidence: timeout-focused run kept websocket open without heartbeats for >30s; presence REST detail returned `Disconnected`.

7. Automatic reconnect works
- Result: PASS
- Evidence: reporter reopened websocket session and received heartbeat ack after reconnect.

8. RBAC prevents unauthorized presence updates
- Result: PASS
- Evidence: viewer websocket heartbeat attempt returned `presence.error` with `RBAC_DENIED`.

9. Audit logs are written for all presence events
- Result: PASS
- Evidence observed in `audit_logs` across validation runs:
  - `reporter.connected`
  - `presence.changed`
  - `reporter.disconnected`
  - `presence.heartbeat.timeout`
  - `presence.override`
  - `authz.decision`

## Notes

- A broad combined run initially missed timeout audit evidence because the session was explicitly disconnected before timeout; a dedicated timeout-only run validated `presence.heartbeat.timeout` emission.
- Temporary validation users and reporter records were cleaned up after runs.

## Conclusion

Phase 3.2 realtime presence foundation is live-validated and ready for Phase 3.3 initiation.
