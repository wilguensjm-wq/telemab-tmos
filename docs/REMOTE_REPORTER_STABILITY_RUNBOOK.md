# TMOS Remote Reporter Stability Runbook

Status: Milestone Approved
Date: 2026-07-25

## 1. Objective

Validate TMOS for real-world reporter connectivity where contributors join from public internet networks without LAN or VPN dependency.

Milestone policy:
- Do not implement additional broadcast features until this validation milestone passes.
- No simulated-only validation is accepted for milestone completion.

Feature freeze while this runbook is active:
- No UI redesigns
- No new broadcast features
- No additional workflow features
- No Program Switcher enhancements beyond bug fixes
- No Reporter feature expansion

Only the following are permitted:
- Bug fixes
- Stability and reliability improvements
- Deployment hardening
- Production validation execution and evidence logging

Required outcome:
- Reporters can connect from external networks through deployed TMOS backend and LiveKit infrastructure.
- Producer receives reliable audio and video from multiple concurrent remote reporters.

## 2. Deployment Policy

Reporter connectivity must use deployed infrastructure only:
- Backend API endpoint must be publicly reachable over HTTPS.
- LiveKit signaling endpoint must be publicly reachable over WSS.
- No reporter workflow may depend on localhost, local private IP, or office LAN reachability.

Startup guard:
- Backend now validates TMOS_MEDIA_LIVEKIT_WS_URL at startup.
- In production, startup is blocked if LiveKit URL is missing, non-WSS, localhost/.local, private IP, or DNS-resolved to non-public addresses.

## 3. Pre-Validation Checklist

1. Set backend environment for production-like execution:
- NODE_ENV=production
- TMOS_MEDIA_LIVEKIT_ENABLED=true
- TMOS_MEDIA_LIVEKIT_WS_URL=wss://<public-livekit-domain>
- TMOS_MEDIA_LIVEKIT_API_KEY and TMOS_MEDIA_LIVEKIT_API_SECRET configured

2. Confirm reporter frontend is deployed against backend API (no local dev proxy assumptions).

3. Verify browser permissions model on test devices:
- Camera: Allow
- Microphone: Allow

4. Confirm TLS certificates are valid for backend and LiveKit public endpoints.

## 4. Stability Validation Matrix

## 4A. Minimum Real-World Topology (Required)

- Reporter 1: Windows laptop on home Wi-Fi
- Reporter 2: Android phone on cellular data
- Reporter 3: Another laptop on a different ISP
- Producer: Control room workstation

All four endpoints must run through deployed TMOS infrastructure and public LiveKit signaling.

### Scenario A: Single remote reporter

- Reporter joins from mobile data network.
- Start camera publish.
- Start microphone publish.
- Confirm Producer receives live audio and video.
- Toggle camera and microphone multiple times.

Success criteria:
- No publish-state mismatch in UI.
- No reporter-side crashes.
- No backend media session inconsistency.

### Scenario B: Multi-reporter cross-network

- Reporter A: home Wi-Fi
- Reporter B: mobile cellular data
- Reporter C: different ISP/city network
- All join same production room.
- Producer monitors all sources concurrently.

Success criteria:
- All reporters visible to Producer.
- Concurrent audio/video streams remain stable.
- No source identity collisions.

### Scenario C: Reconnection resilience

- Drop reporter network for 10-30 seconds.
- Restore network.
- Observe auto-recovery behavior.

Success criteria:
- Reporter reconnects without manual session reset.
- Producer receives resumed feed.
- No orphaned participant state.

### Scenario D: Extended runtime soak

- Run 60-120 minute session with periodic source toggles and reconnect events.

Success criteria:
- No memory-growth alarms or process instability.
- No repeated media track leak symptoms.
- Backend logs show sustained healthy request handling.

### Scenario E: Browser/platform coverage

- Desktop Chromium-based browser
- Desktop Firefox
- Mobile browser (iOS or Android)

Success criteria:
- Join + camera + microphone all functional.
- Error handling remains actionable and user-friendly.

## 5. Observability and Evidence

Collect during validation:
- Backend logs for /api/media/sessions/join, /api/media/rooms, /api/auth/refresh
- Producer confirmation timestamps for first video frame and first audio activity per reporter
- Reporter-side publish attempt outcomes and recovery behavior

Record per test session:
- Date and time
- Device type
- Browser
- Network type
- Join time
- Camera status
- Microphone status
- Producer received media (Yes/No)
- Disconnect count
- Reconnection time
- Console errors
- Backend errors
- Final Pass/Fail

Template file:
- docs/REMOTE_REPORTER_VALIDATION_LOG_TEMPLATE.csv

## 6. Exit Criteria Before New Features

Do not continue with additional broadcast feature work until all are true:
- Remote reporter join stable from public internet across at least 3 independent networks.
- Camera publish reliability confirmed.
- Microphone publish reliability confirmed.
- Producer receives all remote feeds in real time.
- Reconnection behavior verified and repeatable.
- No crashes or severe resource leak indicators during soak test.
- No dependency on localhost, private IPs, VPNs, or office LAN exists for reporter connectivity.

## 7. Known Enforcement in Code

- Backend startup policy for remote reporter deployment lives in:
  - backend/src/services/deploymentGuardService.js
  - backend/src/server.js

This policy is intended to prevent accidental production deployments that rely on local/LAN-only LiveKit connectivity.
