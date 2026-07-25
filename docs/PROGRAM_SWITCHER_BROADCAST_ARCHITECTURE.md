# TMOS Program Switcher Broadcast Architecture

Status: Approved Clarification Draft
Date: 2026-07-25

## 1. Explicit Broadcast Engine Definition

TMOS Broadcast Engine is the backend runtime centered on these concrete services:

- backend/src/services/broadcast/broadcastEngine.js
  - Authoritative broadcast state owner (engineStatus, activeProgram, output state)
  - Entry point for start, stop, restart, record control, and active program updates
- backend/src/services/broadcast/ffmpegManager.js
  - Actual media composition and encode process manager
  - Runs FFmpeg process and returns runtime metrics (bitrate, fps, dropped frames, out_time)
- backend/src/services/broadcast/recordingManager.js
  - Recording destination and lifecycle management
- backend/src/services/broadcast/rtmpOutputManager.js
  - RTMP output endpoint configuration and connection status
- backend/src/services/broadcast/srtOutputManager.js
  - SRT output endpoint configuration and connection status
- backend/src/services/broadcast/broadcastHealthService.js
  - Aggregates final status returned to clients and health consumers

Control/API layer:
- backend/src/controllers/BroadcastController.js
- backend/src/routes/v1.js routes under /broadcast/*

Wiring/bootstrap:
- backend/src/server.js instantiates and composes all broadcast services.

## 2. Layer Separation (Required)

### Contribution Layer (Incoming Feeds)

Purpose: ingest and observe reporter/contributor feeds.

Components:
- LiveKit room participants and tracks
- Reporter Portal, Producer monitoring tiles, Live Sources tiles
- Media session lifecycle APIs under /media/*

Rules:
- Shows incoming source media only
- Never treated as final broadcast output
- Source status may be connected while broadcast is down

### Broadcast Layer (Program Output)

Purpose: compose selected source into program output and distribute outputs.

Components:
- BroadcastEngine + FfmpegManager + output managers
- /broadcast/* APIs
- Program monitor confidence feed (PGM return)

Rules:
- Program monitor must represent actual output path
- Backend state is authoritative for all switching/routing
- No frontend-only switching truth

## 3. Program Composition Ownership

Current concrete owner:
- Program composition is performed by FFmpeg process managed by backend/src/services/broadcast/ffmpegManager.js under orchestration of backend/src/services/broadcast/broadcastEngine.js.

Authoritative state owner:
- backend/src/services/broadcast/broadcastEngine.js owns activeProgram and engine state.

Switch command path:
- Frontend Program Switcher action -> PATCH /broadcast/program -> BroadcastController.setActiveProgram -> BroadcastEngine.setActiveProgram

## 4. PGM Return Track Ownership

Required production behavior:
- Program monitor must subscribe to a backend-published PGM return track, not a contributor track.

Service responsibility (explicit):
- BroadcastEngine remains the owner of when and what is on program.
- Add backend broadcast service ProgramReturnPublisher under backend/src/services/broadcast/ with this responsibility:
  - Acquire encoded/selected program output from BroadcastEngine pipeline
  - Publish/refresh a dedicated PGM participant track into LiveKit
  - Keep a stable identity such as tmos-program-return
  - Expose health/status (published, muted, disconnected, error)

Integration points:
- BroadcastEngine invokes ProgramReturnPublisher on start/stop/restart and on activeProgram changes.
- ProgramReturnPublisher uses backend media provider abstraction to interact with LiveKit (no frontend provider access).

## 5. Program Switcher Runtime Behavior

- Preview window binds to selected contribution source track.
- Program window binds only to PGM return track.
- TAKE/CUT/FADE action updates backend activeProgram.
- Backend updates composition route and ensures PGM return reflects actual output.
- Frontend updates visual tally from backend status; frontend does not invent output state.

## 6. Multi-Reporter and Scaling Model

- Source registry remains participant-identity and track-sid based.
- Contribution subscriptions are per tile and adaptive.
- Program path remains singular authoritative bus (PGM) with one confidence return.
- Future scaling:
  - Add Preview bus and AUX bus as additional backend-owned program buses
  - Add second program engine instance for N+1 redundancy
  - Keep same separation: contribution tracks in Live Sources, output confidence tracks in Program monitors

## 7. Non-Negotiable Production Rules

- Live Sources page = contribution layer only
- Program monitor = broadcast layer output only
- No hardcoded demo values for fps/bitrate/latency
- Unavailable telemetry must render explicit states:
  - No active broadcast
  - No active reporters
  - No incoming video
  - No audio available
