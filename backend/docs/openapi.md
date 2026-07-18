# TMOS API Endpoint Design

## Authentication
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh
- GET /api/auth/profile

## Users
- GET /api/users
- GET /api/users/:id
- POST /api/users
- PATCH /api/users/:id
- DELETE /api/users/:id

## Roles and Permissions
- GET /api/roles
- GET /api/permissions
- POST /api/roles
- PATCH /api/roles/:id

## Channels
- GET /api/channels
- GET /api/channels/:id
- POST /api/channels
- PATCH /api/channels/:id
- DELETE /api/channels/:id

## Live Streams
- GET /api/streams
- GET /api/streams/:id
- POST /api/streams
- PATCH /api/streams/:id
- DELETE /api/streams/:id

## Media Assets
- GET /api/assets
- GET /api/assets/:id
- POST /api/assets
- PATCH /api/assets/:id
- DELETE /api/assets/:id

## Playlists and Schedules
- GET /api/playlists
- GET /api/schedules
- POST /api/playlists
- POST /api/schedules

## Programs and Categories
- GET /api/programs
- GET /api/categories
- POST /api/programs
- POST /api/categories

## Analytics and Alerts
- GET /api/analytics
- GET /api/alerts
- POST /api/alerts

## AI Conversations
- GET /api/ai/conversations
- POST /api/ai/conversations
- POST /api/ai/conversations/:id/messages

## Audit Logs and Settings
- GET /api/audit-logs
- GET /api/settings
- PATCH /api/settings

## Reporter Control Room (Phase 3.1)

All endpoints are served from `/api/v1` and protected by backend auth and RBAC middleware.

### Reporters
- GET /api/v1/reporters
- GET /api/v1/reporters/:reporterId
- POST /api/v1/reporters
- PATCH /api/v1/reporters/:reporterId
- DELETE /api/v1/reporters/:reporterId

### Studios
- GET /api/v1/studios
- GET /api/v1/studios/:studioId
- POST /api/v1/studios
- PATCH /api/v1/studios/:studioId
- DELETE /api/v1/studios/:studioId

### Assignments
- GET /api/v1/assignments
- GET /api/v1/assignments/:assignmentId
- POST /api/v1/assignments
- PATCH /api/v1/assignments/:assignmentId
- DELETE /api/v1/assignments/:assignmentId

### RBAC permissions
- reporters.read / reporters.write
- studios.read / studios.write
- assignments.read / assignments.write

## Reporter Presence & Control Room (Phase 3.2)

All endpoints are served from `/api/v1` and protected by backend auth and RBAC middleware.

### Presence REST endpoints
- GET /api/v1/presence/reporters
- GET /api/v1/presence/reporters/:reporterId
- POST /api/v1/presence/reporters/:reporterId/override

### Presence lifecycle fields
- connectionStatus: Offline | Connecting | Online | Ready | Live | Disconnected
- lastHeartbeat
- loginTime
- currentAssignmentId
- currentStudioId
- deviceType
- operatingSystem
- appVersion
- cameraReady
- microphoneReady
- speakerReady
- internetQuality
- signalStrength
- batteryLevel
- isCharging

### Presence RBAC permissions
- presence.read
- presence.update
- presence.override

Role default mapping:
- Operator: read/update/override.
- Producer: read/override.
- Viewer: read-only.

## Media Abstraction Layer (Phase 3.3 Step 1)

All media operations are provider-agnostic at API/service/controller level and routed through a `MediaProvider` interface.

### Media abstraction endpoints
- GET /api/v1/media/providers/capabilities
- GET /api/v1/media/rooms
- POST /api/v1/media/rooms
- POST /api/v1/media/sessions/join
- POST /api/v1/media/sessions/:participantId/leave
- POST /api/v1/media/sessions/:participantId/devices
- POST /api/v1/media/sessions/:participantId/publisher
- POST /api/v1/media/sessions/:participantId/producer-control

### Generic media concepts modeled
- Media Sessions
- Rooms
- Participants
- Publishers
- Subscribers
- Device Selection
- Join / Leave
- Producer Controls

### Media RBAC permissions
- media.capabilities.read
- media.rooms.read
- media.rooms.write
- media.session.join
- media.session.leave
- media.device.select
- media.publisher.control
- media.producer.control

### Audit actions
- media.session.create
- media.session.join
- media.session.leave
- media.provider.selected
- media.device.select
- media.publisher.toggle
- media.producer.control

Role default mapping:
- Operator: read + write for all Reporter Control Room domains.
- Viewer: read-only for all Reporter Control Room domains.

## Media Session Orchestration (Phase 3.3 Step 2)

All orchestration operations are provider-agnostic and executed via TMOS `MediaService` -> `MediaProvider` interface.

### Session orchestration endpoints
- POST /api/v1/media/sessions
- GET /api/v1/media/sessions
- GET /api/v1/media/sessions/:id
- PATCH /api/v1/media/sessions/:id
- DELETE /api/v1/media/sessions/:id

### Participant orchestration endpoints
- POST /api/v1/media/sessions/:id/participants
- DELETE /api/v1/media/sessions/:id/participants/:participantId
- POST /api/v1/media/sessions/:id/mute
- POST /api/v1/media/sessions/:id/unmute
- POST /api/v1/media/sessions/:id/promote
- POST /api/v1/media/sessions/:id/demote
- POST /api/v1/media/sessions/:id/transfer

### Session metadata model
- sessionId
- roomId
- programName
- assignmentId
- studioId
- producerUserId
- producerUsername
- status
- activeParticipants
- recordingEnabled (placeholder)
- notes
- startedAt
- endedAt

### Participant lifecycle states
- offline
- authenticated
- connected
- joined
- ready
- live
- muted
- disconnected

### Media orchestration RBAC permissions
- media.session.read
- media.session.create
- media.session.update
- media.session.close
- media.participant.manage
- media.producer.transfer

### Orchestration audit actions
- media.session.created
- media.session.updated
- media.session.closed
- media.participant.joined
- media.participant.left
- media.participant.muted
- media.participant.unmuted
- media.participant.promoted
- media.participant.demoted
- media.producer.transferred

## Media Reliability Controls (Phase 3.3 Step 3)

Step 3 extends orchestration with readiness gating, idempotency, and optimistic concurrency controls while preserving provider-agnostic architecture.

### Reliability endpoints
- POST /api/v1/media/sessions/:id/readiness
- GET /api/v1/media/sessions/:id/readiness
- POST /api/v1/media/sessions/:id/go-live
- POST /api/v1/media/sessions/:id/stop-live

### Header contracts
- If-Match-Version: optional for PATCH /media/sessions/:id and required by policy for live control endpoints.
- Idempotency-Key: required for reliable replay behavior on go-live/stop-live endpoints.

### Step 3 RBAC permissions
- media.session.readiness.read
- media.session.readiness.write
- media.session.live.control

### Step 3 audit actions
- media.readiness.reported
- media.session.live.started
- media.session.live.stopped
- media.operation.idempotent_replay
- media.operation.version_conflict

### Reliability behavior rules
- Version conflict returns HTTP 409 with error.code VERSION_CONFLICT.
- Idempotency key replay returns prior success payload with replayed=true.
- Reuse of an idempotency key with a different payload returns HTTP 409.
- Route authorization remains fail-closed through explicit mapping in route authorization guard.
