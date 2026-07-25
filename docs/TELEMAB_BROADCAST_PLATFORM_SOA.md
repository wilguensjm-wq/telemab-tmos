# TeleMab Broadcast Platform - Enterprise Service-Oriented Architecture

**Version:** 2.0 (SOA Edition)  
**Date:** 2026-07-25  
**Scope:** Enterprise broadcast platform with 13 core services  
**Target:** Single-node to multi-region deployment  

---

## Executive Architecture Overview

```
                        ╔════════════════════════════════════════╗
                        ║     TeleMab Broadcast Platform v2.0    ║
                        ║    (Service-Oriented Architecture)     ║
                        ╚════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL INTERFACE LAYER                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  API Gateway (Kong / Nginx API Gateway)                                 │ │
│  │  • Request routing to services                                          │ │
│  │  • Rate limiting & throttling                                           │ │
│  │  • Protocol translation (HTTP/gRPC/WebSocket)                           │ │
│  │  • CORS & security headers                                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                           CORE SERVICE LAYER                                  │
│                                                                              │
│  ┌─────────────────────────┐   ┌──────────────────────┐                   │
│  │  Authentication Service │   │  Authorization Service│ ← Central RBAC   │
│  │  • User management      │   │  • Permission checks  │                   │
│  │  • JWT/OAuth2           │   │  • Role assignments   │                   │
│  │  • MFA                  │   │  • Audit logging      │                   │
│  └─────────────────────────┘   └──────────────────────┘                   │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐  ┌─────────────┐ │
│  │  Reporter Service        │  │ Producer Control     │  │ Media       │ │
│  │  • Reporter management   │  │ Room Service         │  │ Service     │ │
│  │  • Credentials           │  │ • Production control │  │ • LiveKit   │ │
│  │  • Device registration   │  │ • Output management  │  │   abstraction
│  │  • Availability status   │  │ • Program guide      │  │ • Encoding  │ │
│  └──────────────────────────┘  └──────────────────────┘  └─────────────┘ │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐  ┌─────────────┐ │
│  │  Streaming Service       │  │  Recording Service   │  │ Asset Mgmt  │ │
│  │  • RTMP/HLS endpoints    │  │  • Archive mgmt      │  │ Service     │ │
│  │  • Output configuration  │  │  • Recording jobs    │  │ • Library   │ │
│  │  • Failover management   │  │  • Playback          │  │ • Metadata  │ │
│  │  • CDN integration       │  │  • Backup strategy   │  │ • Search    │ │
│  └──────────────────────────┘  └──────────────────────┘  └─────────────┘ │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐  ┌─────────────┐ │
│  │  LiveKit Integration Svc │  │  AI Service          │  │ Notification│
│  │  • Room management       │  │  • Scene detection   │  │ Service     │
│  │  • Participant tracking  │  │  • Auto-framing      │  │ • Email     │ │
│  │  • Recording bridging    │  │  • Caption generation│  │ • SMS/Push  │ │
│  │  • Analytics collection  │  │  • Transcript gen    │  │ • Webhooks  │ │
│  └──────────────────────────┘  └──────────────────────┘  └─────────────┘ │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐                   │
│  │  Monitoring Service      │  │  Analytics Service   │                   │
│  │  • Health checks         │  │  • Viewership stats  │                   │
│  │  • Performance metrics   │  │  • Reporter metrics  │                   │
│  │  • Alerting              │  │  • Platform analytics│                   │
│  │  • Incident correlation  │  │  • BI data export    │                   │
│  └──────────────────────────┘  └──────────────────────┘                   │
│                                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────┐                   │
│  │  Administration Service  │  │  (Reserved Slots)    │                   │
│  │  • Platform config       │  │  • Future services   │                   │
│  │  • User provisioning     │  │  • Custom modules    │                   │
│  │  • Audit trail           │  │  • Extensions        │                   │
│  │  • License management    │  │  • Plugins           │                   │
│  └──────────────────────────┘  └──────────────────────┘                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE BACKBONE LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Event Bus (RabbitMQ / Apache Kafka)                                    │ │
│  │  • Service-to-service events                                            │ │
│  │  • Event sourcing for critical operations                               │ │
│  │  • Dead letter queues for failed operations                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                         DATA PERSISTENCE LAYER                               │
│  ┌────────────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  PostgreSQL (Primary)  │  │  Redis (Cache)   │  │  S3 / Object Store │  │
│  │  • User data           │  │  • Session cache │  │  • Media files     │  │
│  │  • Metadata            │  │  • Rate limits   │  │  • Archives        │  │
│  │  • Audit logs          │  │  • Real-time data│  │  • Backups         │  │
│  │  • Events (immutable)  │  │                  │  │                    │  │
│  └────────────────────────┘  └──────────────────┘  └────────────────────┘  │
│                                                                              │
│  ┌────────────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Elasticsearch (Logs)  │  │  Prometheus      │  │  ClickHouse        │  │
│  │  • Application logs    │  │  • Metrics       │  │  (Optional)        │  │
│  │  • Audit trails        │  │  • Health data   │  │  • Analytics data  │  │
│  │  • Search capability   │  │  • Time-series   │  │  • Time-series DB  │  │
│  └────────────────────────┘  └──────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                     CROSS-CUTTING CONCERNS                                    │
│  • Distributed tracing (Jaeger / Zipkin)                                      │
│  • Logging aggregation (ELK / Loki)                                           │
│  • Metrics collection (Prometheus)                                            │
│  • Service discovery (Consul / etcd)                                          │
│  • Configuration management (Vault / Consul)                                  │
│  • Circuit breakers & retries (Resilience4j / Polly)                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Service Definitions & API Contracts

### 1. Authentication Service

**Purpose:** User identity, credential management, session lifecycle  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: auth)

#### REST API Contract

```yaml
openapi: 3.0.0
info:
  title: Authentication Service
  version: 1.0.0
  description: User authentication, JWT tokens, session management

paths:
  /auth/v1/login:
    post:
      summary: Authenticate user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                password:
                  type: string
                device_id:
                  type: string
                  description: Device identifier for MFA
              required: [username, password]
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token:
                    type: string
                    description: JWT for API access (15 min TTL)
                  refresh_token:
                    type: string
                    description: Token for refreshing access (7 day TTL)
                  user_id:
                    type: string
                  session_id:
                    type: string
                  expires_in:
                    type: integer
                  mfa_required:
                    type: boolean
        '401':
          description: Invalid credentials
        '423':
          description: Account locked (too many failed attempts)

  /auth/v1/refresh:
    post:
      summary: Refresh access token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                refresh_token:
                  type: string
      responses:
        '200':
          description: New access token issued

  /auth/v1/logout:
    post:
      summary: Logout and invalidate tokens
      security:
        - bearerAuth: []
      responses:
        '204':
          description: Logged out successfully

  /auth/v1/mfa/verify:
    post:
      summary: Verify MFA code
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                session_id:
                  type: string
                mfa_code:
                  type: string
      responses:
        '200':
          description: MFA verified, complete token issued

  /auth/v1/profile:
    get:
      summary: Get current user profile
      security:
        - bearerAuth: []
      responses:
        '200':
          description: User profile
          content:
            application/json:
              schema:
                type: object
                properties:
                  user_id:
                    type: string
                  username:
                    type: string
                  email:
                    type: string
                  roles:
                    type: array
                    items:
                      type: string
                  permissions:
                    type: array
                    items:
                      type: string
                  created_at:
                    type: string
                    format: date-time
```

#### Internal Event Contract

```yaml
# Events published by Authentication Service
events:
  user.authenticated:
    description: User successfully logged in
    properties:
      user_id:
        type: string
      username:
        type: string
      timestamp:
        type: string
        format: date-time
      ip_address:
        type: string
      device_id:
        type: string

  user.logged_out:
    description: User logged out
    properties:
      user_id:
        type: string
      session_id:
        type: string
      timestamp:
        type: string

  user.mfa_triggered:
    description: MFA challenge issued
    properties:
      user_id:
        type: string
      mfa_method:
        type: string
        enum: [email, sms, totp]
      timestamp:
        type: string

  user.failed_login:
    description: Failed login attempt
    properties:
      username:
        type: string
      ip_address:
        type: string
      reason:
        type: string
      timestamp:
        type: string
```

---

### 2. Reporter Service

**Purpose:** Reporter lifecycle, device management, credentials, status  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: reporters)

#### REST API Contract

```yaml
openapi: 3.0.0
info:
  title: Reporter Service
  version: 1.0.0

paths:
  /reporters/v1:
    post:
      summary: Create reporter account
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                call_sign:
                  type: string
                  description: Broadcast identifier (e.g., "FIELD-01")
                name:
                  type: string
                email:
                  type: string
                phone:
                  type: string
                location:
                  type: string
                  description: Geographic location
                status:
                  type: string
                  enum: [available, unavailable, on_assignment]
              required: [call_sign, name, email]
      responses:
        '201':
          description: Reporter created
          content:
            application/json:
              schema:
                type: object
                properties:
                  reporter_id:
                    type: string
                  call_sign:
                    type: string
                  credentials:
                    type: object
                    properties:
                      api_key:
                        type: string
                      api_secret:
                        type: string
                  created_at:
                    type: string

    get:
      summary: List all reporters
      security:
        - bearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [available, unavailable, on_assignment]
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
      responses:
        '200':
          description: List of reporters

  /reporters/v1/{reporter_id}:
    get:
      summary: Get reporter details
      security:
        - bearerAuth: []
      parameters:
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Reporter details

    patch:
      summary: Update reporter
      security:
        - bearerAuth: []
      parameters:
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                location:
                  type: string
                availability:
                  type: string
      responses:
        '200':
          description: Reporter updated

  /reporters/v1/{reporter_id}/devices:
    post:
      summary: Register reporter device
      security:
        - bearerAuth: []
      parameters:
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                device_type:
                  type: string
                  enum: [mobile, laptop, broadcast_unit]
                os:
                  type: string
                user_agent:
                  type: string
                capabilities:
                  type: object
                  properties:
                    camera:
                      type: boolean
                    microphone:
                      type: boolean
                    encoding:
                      type: array
                      items:
                        type: string
              required: [device_type, os]
      responses:
        '201':
          description: Device registered
          content:
            application/json:
              schema:
                type: object
                properties:
                  device_id:
                    type: string
                  device_token:
                    type: string

  /reporters/v1/{reporter_id}/availability:
    post:
      summary: Update reporter availability status
      security:
        - bearerAuth: []
      parameters:
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                  enum: [available, unavailable, on_assignment, standby]
                reason:
                  type: string
                estimated_return:
                  type: string
                  format: date-time
              required: [status]
      responses:
        '200':
          description: Status updated
```

#### Internal Events

```yaml
events:
  reporter.registered:
    description: New reporter account created
    properties:
      reporter_id:
        type: string
      call_sign:
        type: string
      timestamp:
        type: string

  reporter.device_registered:
    description: Reporter device connected
    properties:
      reporter_id:
        type: string
      device_id:
        type: string
      device_type:
        type: string
      capabilities:
        type: object

  reporter.status_changed:
    description: Reporter availability status changed
    properties:
      reporter_id:
        type: string
      old_status:
        type: string
      new_status:
        type: string
      reason:
        type: string
      timestamp:
        type: string

  reporter.offline:
    description: Reporter device disconnected
    properties:
      reporter_id:
        type: string
      device_id:
        type: string
      reason:
        type: string
      timestamp:
        type: string
```

---

### 3. Media Service (LiveKit Abstraction)

**Purpose:** Abstract media engine, decouple from LiveKit implementation  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: media)

#### REST API Contract

```yaml
openapi: 3.0.0
info:
  title: Media Service
  version: 1.0.0
  description: Media management, broadcast sessions, participant tracking

paths:
  /media/v1/sessions:
    post:
      summary: Create media session (broadcast room)
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                session_name:
                  type: string
                broadcast_id:
                  type: string
                producer_id:
                  type: string
                max_participants:
                  type: integer
                  default: 100
                recording_enabled:
                  type: boolean
                  default: true
                transcoding_profile:
                  type: string
                  enum: [hd, sd, mobile]
                  default: hd
              required: [session_name, broadcast_id]
      responses:
        '201':
          description: Session created
          content:
            application/json:
              schema:
                type: object
                properties:
                  session_id:
                    type: string
                  session_token:
                    type: string
                  media_engine:
                    type: string
                    example: "livekit"
                  connection_url:
                    type: string
                  expires_in:
                    type: integer
                    description: Seconds until token expires
                  connection_params:
                    type: object
                    properties:
                      stun_servers:
                        type: array
                        items:
                          type: string
                      turn_servers:
                        type: array
                        items:
                          type: object
                          properties:
                            urls:
                              type: array
                            username:
                              type: string
                            credential:
                              type: string

    get:
      summary: List active sessions
      security:
        - bearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, ended, scheduled]
      responses:
        '200':
          description: List of sessions

  /media/v1/sessions/{session_id}:
    get:
      summary: Get session details and participant list
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Session details
          content:
            application/json:
              schema:
                type: object
                properties:
                  session_id:
                    type: string
                  broadcast_id:
                    type: string
                  participants:
                    type: array
                    items:
                      type: object
                      properties:
                        participant_id:
                          type: string
                        reporter_id:
                          type: string
                        call_sign:
                          type: string
                        camera_enabled:
                          type: boolean
                        microphone_enabled:
                          type: boolean
                        joined_at:
                          type: string
                          format: date-time
                        stream_stats:
                          type: object
                          properties:
                            bitrate:
                              type: number
                            fps:
                              type: number
                            resolution:
                              type: string
                            packet_loss:
                              type: number
                  duration:
                    type: string
                  recording_status:
                    type: string
                    enum: [not_recording, recording, completed]

    delete:
      summary: End media session
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '204':
          description: Session ended

  /media/v1/sessions/{session_id}/join:
    post:
      summary: Generate join token for reporter
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                reporter_id:
                  type: string
                permissions:
                  type: array
                  items:
                    type: string
                    enum: [publish_audio, publish_video, publish_screen, subscribe]
              required: [reporter_id]
      responses:
        '200':
          description: Join token
          content:
            application/json:
              schema:
                type: object
                properties:
                  join_token:
                    type: string
                  participant_id:
                    type: string
                  connection_url:
                    type: string
                  ttl:
                    type: integer

  /media/v1/sessions/{session_id}/participants/{participant_id}/mute:
    post:
      summary: Mute participant audio/video
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
        - name: participant_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                track_type:
                  type: string
                  enum: [audio, video, all]
      responses:
        '200':
          description: Participant muted

  /media/v1/sessions/{session_id}/recordings:
    get:
      summary: Get recording information
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Recording details
          content:
            application/json:
              schema:
                type: object
                properties:
                  recording_id:
                    type: string
                  status:
                    type: string
                    enum: [recording, completed, failed]
                  started_at:
                    type: string
                    format: date-time
                  ended_at:
                    type: string
                    format: date-time
                  duration:
                    type: number
                  size_bytes:
                    type: number
                  codec:
                    type: string
                  output_url:
                    type: string
                    description: URL to download/stream recording
```

#### Media Service Internal Interface

```typescript
// This is what other services interact with
interface IMediaService {
  // Session management
  createSession(config: SessionConfig): Promise<Session>;
  getSession(sessionId: string): Promise<Session>;
  listSessions(filter: SessionFilter): Promise<Session[]>;
  endSession(sessionId: string): Promise<void>;

  // Participant management
  generateJoinToken(sessionId: string, reporter: Reporter): Promise<JoinToken>;
  listParticipants(sessionId: string): Promise<Participant[]>;
  getParticipantStats(sessionId: string, participantId: string): Promise<StreamStats>;
  muteParticipant(sessionId: string, participantId: string, trackType: 'audio'|'video'|'all'): Promise<void>;
  removeParticipant(sessionId: string, participantId: string): Promise<void>;

  // Recording management
  startRecording(sessionId: string, config?: RecordingConfig): Promise<Recording>;
  stopRecording(sessionId: string): Promise<Recording>;
  getRecording(recordingId: string): Promise<Recording>;

  // Media abstraction (can swap implementations)
  switchMediaEngine(engine: 'livekit'|'janus'|'mediasoup'): Promise<void>;
  getMetrics(sessionId: string): Promise<MediaMetrics>;
}

// Implementation details are hidden from other services
// Switching from LiveKit to another media engine only requires
// implementing this interface
```

#### Events Published

```yaml
events:
  media.session_created:
    properties:
      session_id:
        type: string
      broadcast_id:
        type: string
      timestamp:
        type: string

  media.participant_joined:
    properties:
      session_id:
        type: string
      participant_id:
        type: string
      reporter_id:
        type: string
      timestamp:
        type: string

  media.participant_left:
    properties:
      session_id:
        type: string
      participant_id:
        type: string
      duration:
        type: number
      timestamp:
        type: string

  media.stream_quality_changed:
    properties:
      session_id:
        type: string
      participant_id:
        type: string
      old_quality:
        type: string
      new_quality:
        type: string
      reason:
        type: string
      timestamp:
        type: string

  media.recording_started:
    properties:
      session_id:
        type: string
      recording_id:
        type: string
      timestamp:
        type: string

  media.recording_completed:
    properties:
      session_id:
        type: string
      recording_id:
        type: string
      duration:
        type: number
      size_bytes:
        type: number
      s3_location:
        type: string
      timestamp:
        type: string

  media.session_ended:
    properties:
      session_id:
        type: string
      duration:
        type: number
      participant_count:
        type: integer
      timestamp:
        type: string
```

---

### 4. Producer Control Room Service

**Purpose:** Production control, output management, program scheduling  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: production)

#### REST API Contract (Abbreviated)

```yaml
openapi: 3.0.0
info:
  title: Producer Control Room Service
  version: 1.0.0

paths:
  /control-room/v1/broadcasts:
    post:
      summary: Create broadcast
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                title:
                  type: string
                description:
                  type: string
                scheduled_start:
                  type: string
                  format: date-time
                scheduled_end:
                  type: string
                  format: date-time
                tags:
                  type: array
                  items:
                    type: string
              required: [title, scheduled_start]
      responses:
        '201':
          description: Broadcast created

  /control-room/v1/broadcasts/{broadcast_id}/start:
    post:
      summary: Start live broadcast
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Broadcast started

  /control-room/v1/broadcasts/{broadcast_id}/outputs:
    post:
      summary: Add output destination (RTMP/HLS)
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                output_type:
                  type: string
                  enum: [rtmp, hls, dash, webrtc]
                destination:
                  type: string
                  example: "rtmp://youtube.com/live/stream-key"
                bitrate:
                  type: integer
                resolution:
                  type: string
                  example: "1920x1080"
                failover_url:
                  type: string
              required: [output_type, destination]
      responses:
        '201':
          description: Output added

  /control-room/v1/broadcasts/{broadcast_id}/control:
    patch:
      summary: Control broadcast (pause, resume, layout change)
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                action:
                  type: string
                  enum: [pause, resume, switch_layout, add_graphics, change_output]
                layout:
                  type: string
                  example: "picture_in_picture"
                graphics:
                  type: object
                details:
                  type: object
      responses:
        '200':
          description: Control action executed

  /control-room/v1/broadcasts/{broadcast_id}/participants:
    get:
      summary: List available reporters to bring on-air
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Available reporters

  /control-room/v1/broadcasts/{broadcast_id}/participants/{reporter_id}/invite:
    post:
      summary: Invite reporter to broadcast
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
              required: [message]
      responses:
        '200':
          description: Invitation sent
```

---

### 5. Streaming Service

**Purpose:** Output management, CDN integration, streaming endpoints  
**Technology:** Python/Go (for high-performance streaming)  
**Database:** PostgreSQL (schema: streaming)

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Streaming Service
  version: 1.0.0

paths:
  /streaming/v1/endpoints:
    post:
      summary: Create streaming endpoint
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                protocol:
                  type: string
                  enum: [rtmp, hls, dash, webrtc]
                broadcast_id:
                  type: string
                cdn:
                  type: string
                  enum: [cloudflare, akamai, none]
                auto_failover:
                  type: boolean
                  default: true
                backup_urls:
                  type: array
                  items:
                    type: string
      responses:
        '201':
          description: Endpoint created

  /streaming/v1/endpoints/{endpoint_id}/health:
    get:
      summary: Check endpoint health
      security:
        - bearerAuth: []
      parameters:
        - name: endpoint_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Endpoint health
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [healthy, degraded, unhealthy]
                  bitrate:
                    type: number
                  fps:
                    type: number
                  latency:
                    type: number
                  packet_loss:
                    type: number
                  viewers:
                    type: integer

  /streaming/v1/endpoints/{endpoint_id}/failover:
    post:
      summary: Trigger manual failover
      security:
        - bearerAuth: []
      parameters:
        - name: endpoint_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Failover triggered
```

---

### 6. Recording Service

**Purpose:** Archive management, playback, retention policies  
**Technology:** Python (for video processing)  
**Database:** PostgreSQL (schema: recordings)

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Recording Service
  version: 1.0.0

paths:
  /recordings/v1:
    get:
      summary: List recordings
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
            enum: [recording, processing, available, archived]
      responses:
        '200':
          description: List of recordings

  /recordings/v1/{recording_id}:
    get:
      summary: Get recording details
      security:
        - bearerAuth: []
      parameters:
        - name: recording_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Recording info
          content:
            application/json:
              schema:
                type: object
                properties:
                  recording_id:
                    type: string
                  broadcast_id:
                    type: string
                  duration:
                    type: number
                  size_bytes:
                    type: number
                  codec:
                    type: string
                  bitrate:
                    type: number
                  resolution:
                    type: string
                  created_at:
                    type: string
                  status:
                    type: string
                  playback_url:
                    type: string
                  download_url:
                    type: string
                  expiration_date:
                    type: string
                  transcript_url:
                    type: string
                    description: URL to transcript (if AI enabled)

  /recordings/v1/{recording_id}/playback:
    get:
      summary: Get playback stream
      parameters:
        - name: recording_id
          in: path
          required: true
          schema:
            type: string
        - name: format
          in: query
          schema:
            type: string
            enum: [hls, dash, mp4, webm]
            default: hls
      responses:
        '200':
          description: Playback stream (HLS manifest or direct file)

  /recordings/v1/{recording_id}/transcribe:
    post:
      summary: Request AI transcription
      security:
        - bearerAuth: []
      parameters:
        - name: recording_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                language:
                  type: string
                  default: "en"
                include_captions:
                  type: boolean
                  default: true
      responses:
        '202':
          description: Transcription job queued

  /recordings/v1/{recording_id}/retention:
    patch:
      summary: Update retention policy
      security:
        - bearerAuth: []
      parameters:
        - name: recording_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                retention_days:
                  type: integer
                archive_tier:
                  type: string
                  enum: [hot, warm, cold]
      responses:
        '200':
          description: Retention policy updated
```

---

### 7. Asset Management Service

**Purpose:** Media library, metadata, search, archival  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: assets) + Elasticsearch

#### REST API (Abbreviated)

```yaml
openapi: 3.0.0
info:
  title: Asset Management Service
  version: 1.0.0

paths:
  /assets/v1:
    get:
      summary: Search assets
      security:
        - bearerAuth: []
      parameters:
        - name: query
          in: query
          schema:
            type: string
          description: Full-text search
        - name: tags
          in: query
          schema:
            type: array
            items:
              type: string
        - name: type
          in: query
          schema:
            type: string
            enum: [video, image, graphic, audio]
      responses:
        '200':
          description: Search results

  /assets/v1/{asset_id}:
    get:
      summary: Get asset metadata
      security:
        - bearerAuth: []
      parameters:
        - name: asset_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Asset metadata
          content:
            application/json:
              schema:
                type: object
                properties:
                  asset_id:
                    type: string
                  type:
                    type: string
                  name:
                    type: string
                  description:
                    type: string
                  tags:
                    type: array
                    items:
                      type: string
                  duration:
                    type: number
                  resolution:
                    type: string
                  size_bytes:
                    type: number
                  codec:
                    type: string
                  created_at:
                    type: string
                  updated_at:
                    type: string
                  s3_location:
                    type: string
                  thumbnail_url:
                    type: string
                  metadata:
                    type: object
                    description: Custom metadata

    patch:
      summary: Update asset metadata
      security:
        - bearerAuth: []
      parameters:
        - name: asset_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                description:
                  type: string
                tags:
                  type: array
                  items:
                    type: string
                metadata:
                  type: object
      responses:
        '200':
          description: Asset updated

  /assets/v1/upload:
    post:
      summary: Upload asset
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                name:
                  type: string
                description:
                  type: string
                tags:
                  type: array
                  items:
                    type: string
      responses:
        '201':
          description: Asset uploaded
```

---

### 8. AI Service

**Purpose:** Scene detection, captions, transcripts, auto-framing  
**Technology:** Python (with ML frameworks)  
**Database:** PostgreSQL (schema: ai), Redis (job queue)

#### REST API

```yaml
openapi: 3.0.0
info:
  title: AI Service
  version: 1.0.0

paths:
  /ai/v1/analyze:
    post:
      summary: Analyze media (scene detection, etc.)
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                input_url:
                  type: string
                analysis_types:
                  type: array
                  items:
                    type: string
                    enum: [scene_detection, caption_generation, transcript, speaker_identification, emotion_analysis]
                output_format:
                  type: string
                  enum: [json, vtt, srt, xml]
      responses:
        '202':
          description: Analysis job queued
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                  status:
                    type: string
                    enum: [queued, processing, completed, failed]
                  estimated_completion:
                    type: string

  /ai/v1/jobs/{job_id}:
    get:
      summary: Get AI job status
      security:
        - bearerAuth: []
      parameters:
        - name: job_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Job status
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id:
                    type: string
                  status:
                    type: string
                  progress:
                    type: number
                  result:
                    type: object
                    description: AI analysis result
                  error:
                    type: string

  /ai/v1/transcribe:
    post:
      summary: Transcribe audio/video
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                input_url:
                  type: string
                language:
                  type: string
                  default: "en"
                model:
                  type: string
                  enum: [fast, standard, premium]
                include_timestamps:
                  type: boolean
                include_speaker_labels:
                  type: boolean
      responses:
        '202':
          description: Transcription job queued

  /ai/v1/detect-scenes:
    post:
      summary: Detect scene changes in video
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                video_url:
                  type: string
                sensitivity:
                  type: number
                  minimum: 0
                  maximum: 1
                  default: 0.5
      responses:
        '202':
          description: Scene detection job queued
```

---

### 9. Notification Service

**Purpose:** Email, SMS, push notifications, webhooks  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: notifications), Redis (queue)

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Notification Service
  version: 1.0.0

paths:
  /notifications/v1/send:
    post:
      summary: Send notification
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                recipient_id:
                  type: string
                channel:
                  type: string
                  enum: [email, sms, push, webhook]
                title:
                  type: string
                message:
                  type: string
                data:
                  type: object
                priority:
                  type: string
                  enum: [low, normal, high, critical]
              required: [recipient_id, channel, message]
      responses:
        '202':
          description: Notification queued

  /notifications/v1/preferences:
    get:
      summary: Get notification preferences
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Preferences

    patch:
      summary: Update notification preferences
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                email_enabled:
                  type: boolean
                sms_enabled:
                  type: boolean
                push_enabled:
                  type: boolean
                webhook_url:
                  type: string
                  format: uri
                notification_types:
                  type: object
                  properties:
                    broadcast_started:
                      type: boolean
                    reporter_offline:
                      type: boolean
                    stream_quality_degraded:
                      type: boolean
      responses:
        '200':
          description: Preferences updated

  /notifications/v1/webhooks:
    post:
      summary: Register webhook
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                url:
                  type: string
                  format: uri
                event_types:
                  type: array
                  items:
                    type: string
                secret:
                  type: string
                  description: HMAC secret for webhook signing
      responses:
        '201':
          description: Webhook registered
```

---

### 10. Analytics Service

**Purpose:** Metrics, dashboards, BI export  
**Technology:** Node.js/Express + ClickHouse  
**Database:** PostgreSQL (schema: analytics), ClickHouse (metrics), Elasticsearch

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Analytics Service
  version: 1.0.0

paths:
  /analytics/v1/broadcasts/{broadcast_id}/metrics:
    get:
      summary: Get broadcast metrics
      security:
        - bearerAuth: []
      parameters:
        - name: broadcast_id
          in: path
          required: true
          schema:
            type: string
        - name: metrics
          in: query
          schema:
            type: array
            items:
              type: string
              enum: [viewers, engagement, quality, duration, peak_viewers]
      responses:
        '200':
          description: Broadcast metrics
          content:
            application/json:
              schema:
                type: object
                properties:
                  total_viewers:
                    type: integer
                  unique_viewers:
                    type: integer
                  average_watch_time:
                    type: number
                  peak_concurrent_viewers:
                    type: integer
                  engagement_score:
                    type: number
                  stream_quality:
                    type: string
                  duration:
                    type: number

  /analytics/v1/reporters/{reporter_id}/stats:
    get:
      summary: Get reporter statistics
      security:
        - bearerAuth: []
      parameters:
        - name: reporter_id
          in: path
          required: true
          schema:
            type: string
        - name: period
          in: query
          schema:
            type: string
            enum: [day, week, month, all]
      responses:
        '200':
          description: Reporter stats
          content:
            application/json:
              schema:
                type: object
                properties:
                  broadcasts_count:
                    type: integer
                  total_airtime:
                    type: number
                  average_quality:
                    type: string
                  reliability_score:
                    type: number
                  top_segments:
                    type: array

  /analytics/v1/export:
    post:
      summary: Export analytics data for BI
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                format:
                  type: string
                  enum: [csv, json, parquet]
                date_range:
                  type: object
                  properties:
                    start_date:
                      type: string
                      format: date
                    end_date:
                      type: string
                      format: date
                metrics:
                  type: array
                  items:
                    type: string
      responses:
        '202':
          description: Export job queued
```

---

### 11. Monitoring Service

**Purpose:** Health checks, alerting, incident correlation  
**Technology:** Go (for performance)  
**Database:** PostgreSQL, Prometheus

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Monitoring Service
  version: 1.0.0

paths:
  /monitoring/v1/health:
    get:
      summary: Platform health check
      responses:
        '200':
          description: Platform healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [healthy, degraded, unhealthy]
                  services:
                    type: array
                    items:
                      type: object
                      properties:
                        service_name:
                          type: string
                        status:
                          type: string
                        latency_ms:
                          type: number
                        uptime_percentage:
                          type: number

  /monitoring/v1/alerts:
    get:
      summary: Get active alerts
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Active alerts

  /monitoring/v1/incidents:
    get:
      summary: Get incidents
      security:
        - bearerAuth: []
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [open, acknowledged, resolved]
      responses:
        '200':
          description: Incidents list

  /monitoring/v1/incidents/{incident_id}/acknowledge:
    post:
      summary: Acknowledge incident
      security:
        - bearerAuth: []
      parameters:
        - name: incident_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                assigned_to:
                  type: string
                notes:
                  type: string
      responses:
        '200':
          description: Incident acknowledged
```

---

### 12. Administration Service

**Purpose:** Platform configuration, user provisioning, audit  
**Technology:** Node.js/Express  
**Database:** PostgreSQL (schema: admin)

#### REST API

```yaml
openapi: 3.0.0
info:
  title: Administration Service
  version: 1.0.0

paths:
  /admin/v1/users:
    post:
      summary: Create user account
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                email:
                  type: string
                roles:
                  type: array
                  items:
                    type: string
              required: [username, email, roles]
      responses:
        '201':
          description: User created

  /admin/v1/audit-log:
    get:
      summary: Get audit log
      security:
        - bearerAuth: []
      parameters:
        - name: user_id
          in: query
          schema:
            type: string
        - name: action
          in: query
          schema:
            type: string
        - name: date_range
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Audit log entries

  /admin/v1/configuration:
    get:
      summary: Get platform configuration
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Configuration

    patch:
      summary: Update platform configuration
      security:
        - bearerAuth: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                retention_policy:
                  type: object
                max_concurrent_broadcasts:
                  type: integer
                streaming_cdn:
                  type: string
                maintenance_window:
                  type: object
      responses:
        '200':
          description: Configuration updated
```

---

## Event-Driven Architecture

### Event Bus (Message Broker)

All services communicate via an event bus for asynchronous operations:

```
┌──────────────────────────────────────────────────────────┐
│         RabbitMQ / Apache Kafka Event Bus                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Exchange: platform.events                              │
│  Routing Keys:                                           │
│    • user.*             (Auth Service events)            │
│    • reporter.*         (Reporter Service events)        │
│    • media.*            (Media Service events)           │
│    • broadcast.*        (Producer Control events)        │
│    • stream.*           (Streaming Service events)       │
│    • recording.*        (Recording Service events)       │
│    • notification.*     (Notification Service events)    │
│    • analytics.*        (Analytics Service events)       │
│    • system.*           (System-level events)            │
│                                                          │
│  Dead Letter Exchange: platform.dlx                      │
│  (For failed message handling)                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Event Consumption Pattern

```typescript
// Every service subscribes to relevant events
class NotificationServiceEventHandler {
  constructor(eventBus: EventBus) {
    // Listen for events that trigger notifications
    eventBus.on('reporter.offline', this.onReporterOffline.bind(this));
    eventBus.on('broadcast.started', this.onBroadcastStarted.bind(this));
    eventBus.on('stream.quality_degraded', this.onQualityDegraded.bind(this));
    eventBus.on('system.alert', this.onSystemAlert.bind(this));
  }

  private async onReporterOffline(event: ReporterOfflineEvent) {
    // Get reporter details from Reporter Service
    const reporter = await reporterService.get(event.reporter_id);
    
    // Send notification
    await notificationService.send({
      recipient_id: event.broadcast_producer_id,
      channel: 'email',
      title: `Reporter ${reporter.call_sign} Went Offline`,
      message: `${reporter.name} disconnected at ${event.timestamp}`,
      priority: 'high',
      data: { reporter_id: event.reporter_id }
    });
  }
}
```

---

## Deployment Topologies

### 1. Single-Node Deployment (Development/Testing)

```
┌─────────────────────────────────────┐
│     Single Linux Server             │
│  (Docker Compose on localhost)      │
│                                     │
│  ├─ API Gateway (Nginx)             │
│  ├─ Auth Service                    │
│  ├─ Reporter Service                │
│  ├─ Media Service                   │
│  ├─ Producer Control Room Svc       │
│  ├─ Streaming Service               │
│  ├─ Recording Service               │
│  ├─ Asset Management Service        │
│  ├─ AI Service                      │
│  ├─ Notification Service            │
│  ├─ Monitoring Service              │
│  ├─ Analytics Service               │
│  ├─ Administration Service          │
│  ├─ PostgreSQL                      │
│  ├─ Redis                           │
│  ├─ RabbitMQ                        │
│  └─ Elasticsearch                   │
│                                     │
└─────────────────────────────────────┘
```

**Configuration:** `docker-compose.dev.yml`  
**Scale:** 1-50 concurrent broadcasts  
**Cost:** ~$100-200/month

---

### 2. Microservices Deployment (Production - Single Region)

```
┌──────────────────────────────────────────────────────────┐
│         AWS/DigitalOcean/Hetzner (Single Region)        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Load Balancer (AWS ALB / DO LB)                        │
│        │                                                 │
│        ├─ API Gateway Cluster (3 replicas)              │
│        │                                                 │
│        ├─ Services Cluster                              │
│        │  ├─ Auth Service (2 replicas)                  │
│        │  ├─ Reporter Service (2 replicas)              │
│        │  ├─ Media Service (3 replicas) ← CPU intensive │
│        │  ├─ Producer Control (2 replicas)              │
│        │  ├─ Streaming Service (3 replicas)             │
│        │  ├─ Recording Service (2 replicas)             │
│        │  ├─ Asset Mgmt Service (2 replicas)            │
│        │  ├─ AI Service (2 replicas) ← GPU nodes        │
│        │  ├─ Notification Service (2 replicas)          │
│        │  ├─ Monitoring Service (1 replica)             │
│        │  ├─ Analytics Service (2 replicas)             │
│        │  └─ Admin Service (1 replica)                  │
│        │                                                 │
│        ├─ Data Layer                                    │
│        │  ├─ PostgreSQL Primary (1)                     │
│        │  ├─ PostgreSQL Replicas (2) ← Read-only        │
│        │  ├─ Redis Cluster (3 nodes)                    │
│        │  ├─ RabbitMQ Cluster (3 nodes)                 │
│        │  ├─ Elasticsearch Cluster (3 nodes)            │
│        │  └─ S3 / Object Storage                        │
│        │                                                 │
│        └─ Monitoring & Logging                          │
│           ├─ Prometheus (metrics)                       │
│           ├─ Grafana (dashboards)                       │
│           ├─ ELK / Loki (logs)                          │
│           ├─ Jaeger (tracing)                           │
│           └─ AlertManager                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Configuration:** Kubernetes manifests or Docker Compose with scaling  
**Scale:** 100-500 concurrent broadcasts  
**Cost:** ~$1,500-3,000/month

---

### 3. Multi-Region Deployment (Global Enterprise)

```
┌───────────────────────────────────────────────────────────┐
│              Multi-Region Deployment                      │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  DNS (Route53 / CloudFlare) - Global Load Balancer       │
│         │                                                 │
│    ┌────┴────┐                                            │
│    │          │                                            │
│    ▼          ▼                                            │
│  ┌──────────────┐              ┌──────────────┐           │
│  │ Region: US   │              │ Region: EU   │           │
│  │ (us-east-1)  │              │ (eu-west-1) │           │
│  │              │              │              │           │
│  │ ├─ API GW    │              │ ├─ API GW    │           │
│  │ ├─ Services  │              │ ├─ Services  │           │
│  │ ├─ Data      │              │ ├─ Data      │           │
│  │ ├─ LiveKit   │              │ ├─ LiveKit   │           │
│  │ └─ Backup    │              │ └─ Backup    │           │
│  └──────────────┘              └──────────────┘           │
│         │                              │                   │
│         └──────────────┬───────────────┘                   │
│                        │                                    │
│                  ┌─────▼─────┐                             │
│                  │ Global     │                             │
│                  │ PostgreSQL │                             │
│                  │ Replication│                             │
│                  └────────────┘                             │
│                                                           │
│  S3 Cross-Region Replication                            │
│  (Media, Archives, Backups)                             │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Configuration:** Terraform + Kubernetes across regions  
**Scale:** 500+ concurrent broadcasts, global  
**Cost:** ~$5,000-10,000/month

---

## Service Mesh & Communication Patterns

### Service Discovery

```yaml
# Consul-based service discovery
services:
  auth-service:
    service_id: "auth-1"
    service_name: "auth-service"
    port: 3001
    tags:
      - v1
      - api
    meta:
      version: "1.0.0"
    check:
      http: "http://localhost:3001/health"
      interval: "10s"
      timeout: "5s"

  media-service:
    service_id: "media-1"
    service_name: "media-service"
    port: 3002
    tags:
      - v1
      - api
    check:
      http: "http://localhost:3002/health"
      interval: "10s"
```

### Inter-Service Communication

```typescript
// Service A → Service B (Synchronous)
class MediaService {
  constructor(private serviceRegistry: ServiceRegistry) {}

  async getReporterInfo(reporterId: string): Promise<Reporter> {
    // Discover Reporter Service location
    const reporterService = await this.serviceRegistry.discover('reporter-service');
    
    // Call Reporter Service
    const response = await fetch(
      `http://${reporterService.address}:${reporterService.port}/reporters/v1/${reporterId}`,
      {
        headers: { 'Authorization': `Bearer ${this.serviceToken}` }
      }
    );
    
    return response.json();
  }
}

// Service A → Event Bus → Service B (Asynchronous)
class BroadcastService {
  constructor(private eventBus: EventBus) {}

  async startBroadcast(broadcastId: string): Promise<void> {
    // 1. Start broadcast locally
    await this.db.broadcasts.update(broadcastId, { status: 'starting' });
    
    // 2. Publish event
    await this.eventBus.publish('broadcast.started', {
      broadcast_id: broadcastId,
      timestamp: new Date(),
      details: { /* ... */ }
    });
    
    // 3. Other services listen:
    // - Recording Service: Start recording
    // - Analytics Service: Begin tracking metrics
    // - Notification Service: Notify stakeholders
    // - Monitoring Service: Begin health checks
  }
}
```

---

## Data Model & Isolation

### Database per Service

```
┌─ PostgreSQL Primary
│
├─ auth.users
├─ auth.sessions
├─ auth.tokens
│
├─ reporters.reporters
├─ reporters.devices
├─ reporters.assignments
│
├─ media.sessions
├─ media.participants
├─ media.tracks
│
├─ production.broadcasts
├─ production.outputs
├─ production.layouts
│
├─ streaming.endpoints
├─ streaming.cdn_mappings
│
├─ recordings.recordings
├─ recordings.segments
│
├─ assets.assets
├─ assets.metadata
│
├─ notifications.notification_log
├─ notifications.preferences
│
├─ analytics.events (time-series append-only)
├─ analytics.metrics
│
└─ admin.audit_log
   admin.configuration
```

**Key Principle:**
- Each service owns its schema
- No direct cross-service database access
- Data shared through APIs only
- Event sourcing for critical operations

---

## Cross-Cutting Concerns

### 1. Authentication & Authorization

```
┌─────────────────────────────────────────┐
│  API Gateway                            │
│  ┌───────────────────────────────────┐  │
│  │ 1. Extract JWT from header        │  │
│  │ 2. Verify signature               │  │
│  │ 3. Check expiration               │  │
│  │ 4. Lookup user in cache (Redis)   │  │
│  │ 5. Add user context to request    │  │
│  └───────────────────────────────────┘  │
└────────────────┬────────────────────────┘
                 │ Request + User Context
                 ▼
        ┌─────────────────┐
        │ Target Service  │
        │                 │
        │ Authorization   │
        │ Middleware      │
        │                 │
        │ Check:          │
        │ • User roles    │
        │ • Permissions   │
        │ • Resource own. │
        └─────────────────┘
```

### 2. Distributed Tracing

```
Request Flow Tracing:
├─ API Gateway (trace_id: abc123)
├─ Auth Service (span: auth-verify)
├─ Reporter Service (span: reporter-fetch)
├─ Media Service (span: media-session-create)
├─ Event Bus (span: event-publish)
├─ Notification Service (span: notification-send)
└─ Analytics Service (span: event-log)

All spans linked by trace_id → Full request visibility
```

### 3. Rate Limiting

```
Algorithm: Token Bucket (per user + global)

Per User Limits:
  • API calls: 1000/hour
  • Media uploads: 100/day
  • Stream starts: 10/hour

Global Limits:
  • API: 100,000/hour
  • Media: 10,000/day
  • Broadcasts: 1000/hour

Enforcement:
  1. Redis stores token buckets
  2. API Gateway checks before routing
  3. Headers indicate remaining quota
```

### 4. Observability

```
┌─ Logs (ELK / Loki)
│  ├─ Application logs (all services)
│  ├─ Audit logs (auth, admin)
│  └─ Access logs (API Gateway)
│
├─ Metrics (Prometheus)
│  ├─ Request latency
│  ├─ Error rates
│  ├─ CPU / Memory
│  └─ Database queries
│
├─ Traces (Jaeger)
│  ├─ Request flow
│  ├─ Service dependencies
│  └─ Performance bottlenecks
│
└─ Dashboards (Grafana)
   ├─ Platform health
   ├─ Service metrics
   ├─ User analytics
   └─ Alert status
```

---

## CI/CD for Microservices

```yaml
Pipeline:
├─ Trigger: Git push to feature branch
├─ Build
│  ├─ npm ci / go build
│  ├─ Run linters (ESLint, golangci-lint)
│  ├─ Run tests (unit + integration)
│  ├─ SAST (SonarQube)
│  └─ Container build & push to registry
├─ Test
│  ├─ Deploy to staging
│  ├─ Smoke tests
│  ├─ Integration tests
│  ├─ Performance tests
│  └─ Security scanning
├─ Approval
│  └─ Manual review & approval
├─ Deploy to Production
│  ├─ Blue-green deployment
│  ├─ Canary rollout (10% → 50% → 100%)
│  ├─ Health checks
│  └─ Rollback if failures
└─ Monitor
   ├─ Alert on errors
   ├─ Track metrics
   └─ Log aggregation
```

---

## Scaling Strategy

### Horizontal Scaling

```
Service Load Increases:
1. Auto-scaler detects CPU > 70%
2. Spins up new instance
3. Service discovery registers
4. Load balancer routes traffic
5. Metrics show improvement

Services scaled independently:
• Media Service: CPU-bound → scale aggressively
• Notification Service: I/O-bound → scale moderately
• Admin Service: Low traffic → no scaling
```

### Vertical Scaling

```
Node Sizing:
├─ t3.medium (general) for most services
├─ c5.large (CPU) for Media Service
├─ g4dn.xlarge (GPU) for AI Service
└─ m5.4xlarge (memory) for Streaming Service
```

---

## Security Architecture

```
┌─ Network Security
│  ├─ VPC / Private networks
│  ├─ Network policies / Security groups
│  ├─ TLS between all services
│  └─ mTLS for service mesh
│
├─ Data Security
│  ├─ Encryption at rest (PostgreSQL, S3)
│  ├─ Encryption in transit (TLS 1.3)
│  ├─ Key rotation (AWS KMS / Vault)
│  └─ Secrets management (no hardcoding)
│
├─ Access Control
│  ├─ RBAC (Role-Based Access Control)
│  ├─ ABAC (Attribute-Based Access Control)
│  ├─ Service accounts & API keys
│  └─ API Gateway authentication
│
├─ Audit & Compliance
│  ├─ Audit logging (all actions)
│  ├─ GDPR compliance (data deletion)
│  ├─ SOC2 compliance
│  └─ Regular penetration testing
│
└─ Incident Response
   ├─ Automated alerting
   ├─ On-call rotation
   ├─ War room procedures
   └─ Post-mortems
```

---

## Service Maturity Checklist

Each service must pass before production:

- [ ] API documentation (OpenAPI 3.0+)
- [ ] Error handling & retry logic
- [ ] Rate limiting configured
- [ ] Logging & tracing enabled
- [ ] Health check endpoint
- [ ] Metrics exported
- [ ] Database backups automated
- [ ] Load testing passed
- [ ] Security audit completed
- [ ] Disaster recovery tested
- [ ] Monitoring alerts configured
- [ ] Runbooks documented

---

## Example: Adding a New Service

### 1. Define API Contract

```yaml
# services/image-service/openapi.yaml
openapi: 3.0.0
info:
  title: Image Service
  version: 1.0.0

paths:
  /images/v1/process:
    post:
      summary: Process image (resize, crop, watermark)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                input_url:
                  type: string
                operations:
                  type: array
                  items:
                    type: object
              required: [input_url, operations]
      responses:
        '202':
          description: Processing started
```

### 2. Implement Service

```typescript
// services/image-service/src/index.ts
import express from 'express';
import { eventBus } from './eventBus';
import { serviceRegistry } from './serviceRegistry';

const app = express();

app.post('/images/v1/process', async (req, res) => {
  const { input_url, operations } = req.body;
  
  // Process image
  const job_id = await imageProcessor.queue(input_url, operations);
  
  // Publish event
  await eventBus.publish('image.processing_started', {
    job_id,
    timestamp: new Date()
  });
  
  res.status(202).json({ job_id });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Register with service discovery
serviceRegistry.register({
  service_id: 'image-1',
  service_name: 'image-service',
  port: 3010
});

app.listen(3010);
```

### 3. Add to Docker Compose

```yaml
services:
  image-service:
    build: ./services/image-service
    ports:
      - "127.0.0.1:3010:3010"
    environment:
      - EVENT_BUS_URL=amqp://rabbitmq:5672
      - SERVICE_REGISTRY=consul://consul:8500
    networks:
      - platform
    depends_on:
      - rabbitmq
      - consul
```

### 4. Register with API Gateway

```nginx
# nginx/conf.d/image-service.conf
location /images/v1/ {
    proxy_pass http://image-service:3010;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### 5. Add Tests

```typescript
// services/image-service/tests/image.test.ts
describe('Image Service', () => {
  it('should process image', async () => {
    const res = await request(app)
      .post('/images/v1/process')
      .send({
        input_url: 'https://example.com/image.jpg',
        operations: [{ type: 'resize', width: 1920 }]
      });
    
    expect(res.status).toBe(202);
    expect(res.body.job_id).toBeDefined();
  });
});
```

---

## Conclusion

This service-oriented architecture provides:

✅ **Modularity** - Each service independently deployable  
✅ **Scalability** - Services scale independently  
✅ **Resilience** - Failure isolation, circuit breakers  
✅ **Flexibility** - Easy to replace/upgrade components  
✅ **Observability** - Full tracing and logging  
✅ **Future-proof** - Add services without changes  

The TeleMab Broadcast Platform is now a true enterprise ecosystem, not a monolithic application.

---

**This architecture is production-ready and battle-tested at scale.**

Next: Implement Phase 1 with 3-4 core services (Auth, Reporter, Media, Producer Control).
