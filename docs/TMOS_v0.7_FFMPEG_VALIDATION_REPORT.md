# TMOS v0.7 FFmpeg Validation Report

Date: 2026-07-21
Target: TMOS v0.7 - Real Broadcast Engine
Status: Blocked for release

## Scope

This phase replaced the v0.6 Broadcast Engine placeholders with real FFmpeg process management while preserving the backend-only Broadcast Engine abstraction.

Implemented architecture remained:

UI -> Broadcast API -> Broadcast Engine -> FFmpeg Manager -> FFmpeg process

## Implemented

Backend:
- Real FFmpeg process supervision via child_process.spawn()
- PID, running state, exit code, crash tracking, logs, graceful shutdown
- Automatic restart on unexpected FFmpeg exit
- Recording file generation with timestamped daily folders under recordings/YYYY/MM/DD
- Recording metadata: current file, file size, duration, history, storage usage
- RTMP output configuration and live push to local test endpoint
- SRT output configuration and failure isolation using tee muxing with onfail=ignore
- Extended health reporting: FFmpeg running, PID, CPU, memory, bitrate, FPS, dropped frames, reconnect count, recording status, output status, last error, uptime

Frontend:
- Dashboard Broadcast Engine card extended with timer/file/CPU/RAM/bitrate/FPS/dropped frames fields
- Program Switcher controls wired to real backend actions: start, stop, record start, record stop, restart FFmpeg, refresh engine
- Program Switcher broadcast status expanded with PID, output state, timer, current output, engine health

## Validation Results

### Passed

Backend starts:
- PASS

Backend tests:
- PASS
- `cd backend && npm test`
- 65 passed, 0 failed

Frontend build:
- PASS
- `cd frontend && npm run build`
- Existing Vite dynamic import / chunk-size warnings remain non-blocking

Real FFmpeg launch:
- PASS
- Engine start returned a live FFmpeg PID
- Verified command used bundled ffmpeg binary from backend/node_modules/ffmpeg-static/ffmpeg

Clean FFmpeg termination:
- PASS
- Broadcast stop returned engineStatus=stopped and ffmpegRunning=false

Recording start:
- PASS
- Recording start created timestamped recording targets under recordings/YYYY/MM/DD

Recording stop:
- PASS
- Recording stop finalized recording state and preserved file metadata

RTMP connect:
- PASS
- Local Node-Media-Server accepted FFmpeg push sessions on port 1935
- Verified `start push` events for RTMP test streams

RTMP disconnect cleanly:
- PASS
- Local Node-Media-Server logged clean close events when FFmpeg stopped or restarted

Existing backend-only architecture:
- PASS
- UI continues to communicate only through Broadcast API and Broadcast Engine

### Failed / Blocked

SRT starts:
- BLOCKED

Observed behavior:
- Bundled FFmpeg binary advertises SRT protocol support
- FFmpeg as local SRT receiver segfaulted in this environment during validation
- FFmpeg as broadcaster with SRT enabled could not establish a local SRT session because no working local SRT peer was available after receiver crash
- Sender-side logs consistently reported:
  - `Connection to srt://127.0.0.1:9998?mode=caller&latency=120 failed: Input/output error`
  - `Error opening output files: Input/output error`

Mitigation implemented:
- Broadcast graph now uses tee muxing with `onfail=ignore`
- SRT output failure no longer tears down RTMP and recording paths
- This makes the engine operationally safer, but it does not satisfy the requested SRT validation gate

Dashboard live browser validation:
- Not fully re-run to completion in the final v0.7 blocked state after the SRT issue because release was already blocked by protocol validation
- Prior route/workflow baseline remained stable in v0.6 and frontend build passed after v0.7 changes

No React warnings / routing errors / console errors:
- Not fully re-certified in a final release-grade browser pass after the SRT blocker was isolated

## Key Runtime Evidence

Real FFmpeg lifecycle:
- Start produced live PID and `ffmpegRunning=true`
- Stop produced clean exit and `ffmpegRunning=false`

RTMP evidence:
- Node-Media-Server logged repeated `start push` and `close` events for test endpoints

SRT evidence:
- Bundled FFmpeg receiver segfaulted when used as local SRT peer
- Sender-side logs showed repeated connection failures when no working SRT listener was available

## Release Decision

Do not create release commit/tag for v0.7 yet.

Reason:
- Requested validation matrix is not fully satisfied because SRT could not be validated successfully in this environment

## Recommended Next Step

Provide one of the following so SRT can be validated end to end:
1. A confirmed working SRT peer available on the host or network for caller/listener testing
2. Approval to install or use a different FFmpeg/SRT runtime than the bundled ffmpeg-static binary
3. Approval to ship v0.7 with RTMP/recording fully validated and SRT explicitly marked experimental/unvalidated
