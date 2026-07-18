# Phase 3.2 Architecture - Reporter Presence Foundation

```mermaid
flowchart LR
  ReporterClient[Reporter App\nPhone / Tablet] -->|WS heartbeat + readiness| PresenceWS[/TMOS WS Gateway\n/api/v1/presence/ws/]
  ProducerClient[Producer Dashboard] -->|WS subscribe| PresenceWS
  ProducerClient -->|REST read/override| PresenceAPI[/TMOS REST Presence API\n/api/v1/presence/*/]

  PresenceWS --> Auth[AuthService\nJWT verification]
  PresenceWS --> Authz[AuthorizationService\nRBAC checks]
  PresenceWS --> PresenceSvc[PresenceService\nstate transitions + timeout monitor]

  PresenceAPI --> Auth
  PresenceAPI --> Authz
  PresenceAPI --> PresenceSvc

  PresenceSvc --> PresenceRepo[(reporter_presence)]
  PresenceSvc --> ReporterRepo[(reporters)]
  PresenceSvc --> AssignmentRepo[(assignments)]
  PresenceSvc --> StudioRepo[(studios)]
  PresenceSvc --> AuditSvc[AuditService]
  AuditSvc --> AuditRepo[(audit_logs)]

  PresenceSvc -->|snapshot events| PresenceWS
```

## Notes

- Backend remains the system of record and sole gateway for all presence operations.
- WebSocket and REST layers share the same PresenceService, RBAC, and audit paths.
- No media transport is present in Phase 3.2 (no WebRTC, no LiveKit, no streaming).
- This phase establishes readiness telemetry and connection observability ahead of media integration.
