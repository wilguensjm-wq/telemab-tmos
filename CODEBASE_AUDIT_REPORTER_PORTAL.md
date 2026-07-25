# TMOS Reporter Portal - Codebase Audit & Reuse Analysis

**Date:** 2026-07-24  
**Objective:** Identify existing components that can be extended vs. new code needed  
**Milestone:** One authenticated external reporter logs in → grants camera/mic permissions → connects to LiveKit → appears in Control Room

---

## Existing Infrastructure - REUSABLE ✅

### 1. Frontend Authentication (100% Reusable)
**Location:** `frontend/src/contexts/AuthContext.jsx` + `frontend/src/services/authService.js`

**What Works:**
- ✅ `login({ username, password, rememberMe })` - Already handles TMOS auth
- ✅ Token storage in localStorage
- ✅ `useAuth()` hook for any page
- ✅ Automatic token refresh on expiration

**For Reporter Portal:** Use existing `AuthContext` → No new code needed

**Evidence:**
```javascript
const { user, login, isAuthenticated } = useAuth();
const result = await login({ username, password, rememberMe });
// Result includes: user, accessToken, refreshToken
```

---

### 2. LiveKit Components (95% Reusable)

#### LiveKitRoomManager Component
**Location:** `frontend/src/components/livekit/LiveKitRoomManager.jsx`  
**Current Use:** LiveSources.jsx (producer view)

**What Works:**
- ✅ Join/Leave room functionality
- ✅ Toggle camera on/off
- ✅ Toggle microphone on/off  
- ✅ Shows room name, connection state, network quality, participant count
- ✅ UI completely ready - just needs parent component

**Code:**
```javascript
<LiveKitRoomManager
  roomState={liveKitState}
  onJoin={handleJoinRoom}
  onLeave={handleLeaveRoom}
  onToggleCamera={handleToggleCamera}
  onToggleMicrophone={handleToggleMicrophone}
  onRefresh={handleRefreshParticipants}
  busy={actionBusy}
/>
```

**For Reporter Portal:** Use unchanged - No refactoring needed

---

#### VideoTile Component  
**Location:** `frontend/src/components/livekit/VideoTile.jsx`

**What Works:**
- ✅ Displays individual participant
- ✅ Shows identity, connection status, camera/mic state
- ✅ Audio level meter
- ✅ Speaking indicator
- ✅ Network quality metrics

**For Reporter Portal:** Displays reporter + any other participants - No changes needed

---

#### ParticipantGrid Component
**Location:** `frontend/src/components/livekit/ParticipantGrid.jsx`

**What Works:**
- ✅ Grid layout of VideoTiles
- ✅ Empty state when no participants
- ✅ Handles variable participant count

**For Reporter Portal:** Displays all participants in room - No changes needed

---

#### Supporting Components
**Location:** `frontend/src/components/livekit/`

- ✅ `ConnectionBadge.jsx` - Status indicator
- ✅ `AudioLevelMeter.jsx` - Audio visualization

**For Reporter Portal:** Already included in VideoTile - No changes needed

---

### 3. LiveKit Service (70% Reusable)

**Location:** `frontend/src/services/liveSourcesService.js`

**What Works:**
```javascript
// Join a room
await liveSourcesService.joinLiveKitRoom({
  roomName: "tmos-control-room",
  identity: user.username,
  role: "reporter",
  metadata: { module: "reporter-portal" }
});

// Leave room
await liveSourcesService.leaveLiveKitRoom();

// Get current state
const state = liveSourcesService.getLiveKitState();
// Returns: { roomName, connectionState, participants[], etc }

// Subscribe to updates
const unsubscribe = liveSourcesService.subscribe((payload) => {
  // Handle participant updates
});
```

**Gap:** No permission handling for camera/microphone access

**For Reporter Portal:** Use joinLiveKitRoom() → Add camera/mic permission request wrapper

---

### 4. Media Service (80% Reusable)

**Location:** `frontend/src/services/mediaService.js`

**What Already Works:**
```javascript
// Create a media session
await mediaService.createManagedSession({
  actor: user.username,
  user,
  payload: {
    roomName: "tmos-control-room",
    participantRole: "reporter",
    participantIdentity: user.username
  }
});

// List sessions
await mediaService.listManagedSessions();

// Get session details
await mediaService.getManagedSession(sessionId);
```

**Gap:** No token generation for LiveKit (backend endpoint missing)

**For Reporter Portal:** Call existing API → Backend will provide LiveKit token

---

### 5. Existing Pages as Reference

#### LiveSources.jsx
**Location:** `frontend/src/pages/LiveSources.jsx`

**What We Can Reuse:**
- ✅ Pattern of using `liveSourcesService.joinLiveKitRoom()`
- ✅ Pattern of subscribing to state updates
- ✅ Pattern of displaying participants with `ParticipantGrid`
- ✅ Error handling and notification patterns

**Recommendation:** Reporter Portal = LiveSources.jsx without the producer controls

---

## What Needs to Be Added - MINIMAL ✅

### 1. Backend: CORS Middleware

**File:** `backend/src/middleware/corsMiddleware.js` (NEW)

```javascript
// 60 lines of code
// Allows reporter.telemab.com to make API requests
```

**File:** `backend/src/middleware/securityHeadersMiddleware.js` (NEW)

```javascript
// 30 lines of code
// Add HSTS, X-Frame-Options, CSP headers
```

**File:** `backend/src/app.js` (MODIFY - 2 lines)

```javascript
app.use(securityHeadersMiddleware);  // ADD
app.use(corsMiddleware);              // ADD
// (before other middleware)
```

---

### 2. Backend: LiveKit Token Endpoint

**File:** `backend/src/routes/v1.js` (MODIFY - add 1 new route)

```javascript
// POST /api/v1/media/sessions/{sessionId}/token
// Returns: { token, roomName, participantIdentity }
// Already implemented in mediaService, just needs route
```

**Status:** Backend likely already supports this via `mediaService.getSessionToken()`  
**Verification needed:** Check if endpoint exists

---

### 3. Frontend: Permission Handler Component

**File:** `frontend/src/components/livekit/PermissionGate.jsx` (NEW)

```javascript
// ~80 lines of code
// Handles camera/microphone permission requests
// Returns: { cameraGranted, microphoneGranted, error }
```

---

### 4. Frontend: Reporter Entry Page (MINIMAL)

**Option A: Extend Login Page** (Recommended - Minimal Change)
- Current: `frontend/src/pages/Login.jsx` works for both internal + external
- Change: After login, detect if `reporter.telemab.com` domain → redirect to `/reporter-studio` instead of `/dashboard`

**Option B: New Route (Alternative)**
- Create: `frontend/src/pages/ReporterStudio.jsx`
- Wraps existing LiveKitRoomManager + PermissionGate
- ~120 lines (mostly composition of existing components)

---

## Architecture Decision Matrix

| Requirement | Approach | Reuse % | New Code |
|---|---|---|---|
| **Authentication** | Use existing AuthContext | 100% | 0 lines |
| **Camera/Mic UI** | Use existing LiveKitRoomManager | 100% | 0 lines |
| **Participant Display** | Use existing VideoTile + ParticipantGrid | 100% | 0 lines |
| **Room Connection** | Use existing liveSourcesService | 90% | 20 lines (permission wrapper) |
| **Permission Request** | New PermissionGate component | 0% | 80 lines |
| **Backend Token API** | Existing mediaService endpoint | 95% | 1 route (if missing) |
| **CORS/Headers** | New middleware | 0% | 100 lines |
| **Nginx Config** | New (infrastructure) | 0% | 150 lines |

**Total New Frontend Code:** ~200 lines  
**Total New Backend Code:** ~100 lines  
**Refactoring Existing Code:** 0 lines (composition only)

---

## Proposed Implementation Path (Minimal)

### Phase 1: Backend (1 hour)
```
[ ] 1. Add corsMiddleware.js
[ ] 2. Add securityHeadersMiddleware.js  
[ ] 3. Add to app.js (2 lines)
[ ] 4. Verify GET /api/v1/media/sessions/{id}/token endpoint exists
      If missing: Add 10-line route to v1.js
```

### Phase 2: Frontend (2 hours)
```
[ ] 1. Create PermissionGate.jsx component (80 lines)
       - Requests camera/microphone permissions
       - Returns permission status
       
[ ] 2. Create ReporterStudio.jsx page (120 lines)
       - Use PermissionGate wrapper
       - Use LiveKitRoomManager (existing)
       - Use liveSourcesService.joinLiveKitRoom()
       - Display ParticipantGrid (existing)
       
[ ] 3. Add route to router.jsx (3 lines)
       - /reporter → redirects to /reporter/studio if authenticated
       - /reporter/studio → ReporterStudio page
```

### Phase 3: Nginx (1 hour)
```
[ ] 1. Configure Nginx for reporter.telemab.com
[ ] 2. Route to same frontend (port 5173)
[ ] 3. Backend routes to same API (port 8081)
```

---

## Components NOT to Reuse (Why)

### ProducerControlRoom.jsx
**Why Skip:** Too much producer-specific logic
- Producer queue management
- Approval workflows  
- Role-based actions (take-live, end-live)

**What We Need Instead:** Simpler "just connect me" interface

---

### Reporters.jsx  
**Why Skip:** Admin roster management
- List all reporters
- Update reporter status (live/waiting/offline)
- Reporter card UI

**What We Need Instead:** Current reporter's own connection

---

### MediaIngest.jsx
**Why Skip:** FFmpeg pipeline monitoring
- Completely different use case
- Not relevant to reporter connection

---

## File-by-File Reuse Summary

```
✅ FULLY REUSABLE (No changes):
  - frontend/src/contexts/AuthContext.jsx
  - frontend/src/contexts/UserContext.jsx
  - frontend/src/contexts/NotificationContext.jsx
  - frontend/src/components/livekit/LiveKitRoomManager.jsx
  - frontend/src/components/livekit/VideoTile.jsx
  - frontend/src/components/livekit/ParticipantGrid.jsx
  - frontend/src/components/livekit/ConnectionBadge.jsx
  - frontend/src/components/livekit/AudioLevelMeter.jsx
  - frontend/src/services/authService.js
  - frontend/src/services/liveSourcesService.js
  - frontend/src/services/mediaService.js
  - frontend/src/hooks/useNotification.js

⚠️ NEEDS MINOR ADDITIONS:
  - backend/src/app.js (add 2 middleware imports)
  - backend/src/routes/v1.js (1 route if missing)
  - frontend/src/routes/router.jsx (add 2-3 routes)

🆕 NEW FILES NEEDED:
  - backend/src/middleware/corsMiddleware.js
  - backend/src/middleware/securityHeadersMiddleware.js
  - frontend/src/components/livekit/PermissionGate.jsx
  - frontend/src/pages/ReporterStudio.jsx
  - nginx/reporter-portal.conf
```

---

## Success Path: What We Do NOT Need to Do

❌ **DO NOT** refactor LiveSources.jsx  
❌ **DO NOT** create separate LiveKit wrapper (use existing service)  
❌ **DO NOT** build new media session manager (use existing)  
❌ **DO NOT** rewrite authentication (use existing)  
❌ **DO NOT** create participant display components (use existing)  
❌ **DO NOT** build new permission system (just request browser API)  

---

## Minimal Viable Implementation

**Total Implementation Time:** ~4 hours  
**Code Changes:** ~300 lines (90% in new small files)  
**Code Refactoring:** 0 lines  
**Architecture Changes:** 0 changes  

**Files to Touch:**
```
New:      4 files (~300 lines total)
Modify:   3 files (~15 lines total)
Untouched: 15+ files (existing, working)
```

---

## Next Steps

1. ✅ Approve this reuse analysis
2. 📋 Implement Phase 1 (Backend middleware + CORS)
3. 🎨 Implement Phase 2 (PermissionGate + ReporterStudio)
4. 🚀 Implement Phase 3 (Nginx config)
5. ✔️ Test end-to-end: external reporter login → camera/mic grant → connect → appear in control room

Ready to implement with this approach?
