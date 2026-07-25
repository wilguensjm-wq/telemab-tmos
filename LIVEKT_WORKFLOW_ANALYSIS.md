# LiveKit Workflow Analysis - Complete Path & Mode Refactoring Strategy

**Date:** 2026-07-24  
**Objective:** Verify complete LiveKit workflow and assess if LiveSources.jsx can work in Producer + Reporter modes

---

## Complete LiveKit Workflow (End-to-End)

### Step 1: Authentication ✅ (Existing)
```
User → Login Page → authService.login(credentials)
  ↓
JWT Token stored in localStorage
  ↓
AuthContext provides { user, token, isAuthenticated }
```

**Location:** `frontend/src/contexts/AuthContext.jsx`  
**Status:** Production-ready, works for any authenticated user (Producer or Reporter)

---

### Step 2: Room Initialization ✅ (Existing)

```javascript
// LiveSources.jsx calls:
liveSourcesService.joinLiveKitRoom({
  roomName: "tmos-live-sources",
  identity: "operator-123",
  role: "reporter",  // ← Can be any role
  metadata: { module: "live-sources" }
})
```

**Location:** `frontend/src/services/liveSourcesService.js` → `liveKitService.js`  
**Status:** Generic, works with any role

---

### Step 3: Backend Room Creation ✅ (Existing)

```javascript
// liveKitService.ensureRoom() calls backend:
POST /media/rooms
{
  providerKey: "livekit",
  roomName: "tmos-live-sources",
  roomType: "control-room",
  metadata: { module: "live-sources" }
}

// Backend creates room via:
// → MediaController.createRoom()
// → mediaService.createRoom()
// → LiveKitProvider.createRoom()
```

**Status:** Returns `{ providerRoomId, roomName, roomType, metadata, status }`

---

### Step 4: Token Generation ✅ (Existing & Complete)

```javascript
// When joining, backend calls:
POST /media/sessions/join
{
  roomId: "...",
  participantIdentity: "operator-123",
  participantRole: "reporter",  // ← Can be "producer" or "reporter"
  metadata: { ... }
}

// Backend processes:
// → MediaController.joinSession()
// → mediaService.joinSession()
// → LiveKitProvider.joinSession()
//   ↓
//   Calls: LiveKitProvider.buildToken({
//     identity: "operator-123",
//     roomName: "tmos-live-sources",
//     role: "reporter",  // ← Embedded in JWT
//     metadata: { ... }
//   })
//   ↓
//   jwt.sign(payload, apiSecret, { algorithm: "HS256" })
//   ↓
//   Returns: connectionDetails: {
//     token: "eyJhbGciOiJIUzI1NiIs...",
//     wsUrl: "wss://livekit.telemab.com",
//     provider: "livekit"
//   }
```

**Location:** `backend/src/media/providers/LiveKitProvider.js` lines 56-72  
**Status:** ✅ COMPLETE - JWT includes role metadata

---

### Step 5: WebSocket Connection ✅ (Existing)

```javascript
// Frontend receives connectionDetails from backend
// liveKitService.connectRoomClient() calls:
roomClient.connect(wsUrl, token)

// LiveKit SDK validates JWT and establishes WebSocket:
// Room: tmos-live-sources
// Identity: operator-123
// Role: reporter (from JWT metadata)
```

**Location:** `frontend/src/services/liveKitService.js` lines 304-334  
**Status:** ✅ Production-ready

---

### Step 6: Camera Publishing ✅ (Existing)

```javascript
// liveSourcesService.publishCamera(true) calls:
liveKitService.publishCamera(true)

// Which does:
const videoTrack = await createLocalVideoTrack();
await roomClient.localParticipant.publishTrack(videoTrack);
```

**Location:** `frontend/src/services/liveKitService.js` lines 268-299  
**Status:** ✅ Complete - uses native browser MediaDevices API

---

### Step 7: Microphone Publishing ✅ (Existing)

```javascript
// liveSourcesService.publishMicrophone(true) calls:
liveKitService.publishMicrophone(true)

// Which does:
const audioTrack = await createLocalAudioTrack();
await roomClient.localParticipant.publishTrack(audioTrack);
```

**Location:** `frontend/src/services/liveKitService.js` lines 300-326  
**Status:** ✅ Complete

---

### Step 8: Producer Receives Stream ✅ (Existing)

```javascript
// LiveKit server broadcasts to all participants
// Producer (in control room) sees reporter as VideoTile in ParticipantGrid

// liveKitService listens to participant events:
roomClient.on(RoomEvent.ParticipantConnected, ...)
roomClient.on(RoomEvent.TrackSubscribed, ...)
roomClient.on(RoomEvent.ActiveSpeakersChanged, ...)

// Updates state.participants[]
// liveSourcesService builds merged source list
// LiveSources.jsx displays <ParticipantGrid participants={...} />
```

**Location:**
- Listener binding: `liveKitService.js` lines 345-410
- Display: `LiveSources.jsx` lines 225-230

**Status:** ✅ Complete - Producer sees all connected reporters

---

## Workflow Summary

| Step | Component | Status | Works for Reporter? |
|---|---|---|---|
| Authentication | AuthContext | ✅ | Yes |
| Room Join | liveKitService.joinRoom() | ✅ | Yes |
| Token Generation | LiveKitProvider.buildToken() | ✅ | Yes |
| WebSocket Connect | roomClient.connect() | ✅ | Yes |
| Camera Publish | liveKitService.publishCamera() | ✅ | Yes |
| Microphone Publish | liveKitService.publishMicrophone() | ✅ | Yes |
| Producer Sees Reporter | ParticipantGrid | ✅ | Yes |

**Conclusion:** ✅ **ALL steps are complete and generic. No missing pieces.**

---

## LiveSources.jsx - Producer-Specific Elements

Analyzing LiveSources.jsx to identify what is Producer-specific vs. generic:

### ✅ Generic (Works for any role)
```javascript
// Lines 78-82: Join room - works with any identity/role
await liveSourcesService.joinLiveKitRoom({
  roomName,
  identity,
  role,  // ← Can be "producer" or "reporter"
  metadata: { module: "live-sources" }
});

// Lines 186-195: Display participants
<LiveKitRoomManager
  roomState={liveKitState}
  onJoin={handleJoinRoom}
  onLeave={handleLeaveRoom}
  onToggleCamera={handlePublishCamera}
  onToggleMicrophone={handlePublishMicrophone}
  onRefresh={handleRefreshParticipants}
  busy={actionBusy}
/>

// Lines 220-230: Show all participants
<ParticipantGrid participants={liveKitState?.participants || []} />
```

### ⚠️ Producer-Specific (Optional for Reporter Mode)
```javascript
// Lines 52-172: Source inventory display
// - Lists all BASE_SOURCES (studio cameras, weather, guest, etc.)
// - Maps LiveKit participants to sources
// - Shows source cards and table
// - Filters by type/connection status

// This is PRODUCER VIEW:
// Producer needs to see full source inventory
// Reporter only needs to see "I'm broadcasting" + "Who's listening"
```

---

## Refactoring Strategy: Single Component, Two Modes ✅

### Option 1: Mode-Driven Rendering (RECOMMENDED)

```javascript
export default function LiveSources({ mode = "producer" }) {
  // mode: "producer" | "reporter"
  const isProducer = mode === "producer";
  const isReporter = mode === "reporter";
  
  // All existing state/handlers...
  const [sources, setSources] = useState([]);
  const [liveKitState, setLiveKitState] = useState(...);
  
  // Conditional rendering:
  return (
    <ModulePage
      title={isProducer ? "Live Sources Control Room" : "Reporter Studio"}
      subtitle={isProducer ? "Monitor reporters..." : "Broadcast yourself..."}
      // ... other props conditional on mode
    >
      {/* Always show LiveKit controls + participants */}
      <LiveKitRoomManager {...} />
      <ParticipantGrid participants={...} />
      
      {/* Only show source inventory in Producer Mode */}
      {isProducer && (
        <>
          <section>{/* Source cards */}</section>
          <section>{/* Source table */}</section>
        </>
      )}
    </ModulePage>
  );
}
```

**Advantages:**
- ✅ Single component to maintain
- ✅ Shares all LiveKit logic
- ✅ Easy to preview both modes in dev
- ✅ Can pass `mode` prop from router or context

---

### Option 2: Rename + Import (Alternative)

```javascript
// Rename frontend/src/pages/LiveSources.jsx → LiveKit.jsx
// Then create two thin wrappers:

// frontend/src/pages/ProducerLiveSources.jsx
import LiveKit from "../components/livekit/LiveKit.jsx";
export default function ProducerLiveSource() {
  return <LiveKit mode="producer" />;
}

// frontend/src/pages/ReporterStudio.jsx
import LiveKit from "../components/livekit/LiveKit.jsx";
export default function ReporterStudio() {
  return <LiveKit mode="reporter" />;
}
```

**Advantages:**
- ✅ Existing routes unchanged
- ✅ Clear separation at page level
- ✅ Easy to add page-specific context later

---

## Implementation Plan (Minimal Changes)

### Phase 1: Refactor LiveSources.jsx (1 hour)

**File:** `frontend/src/pages/LiveSources.jsx`

```diff
- export default function LiveSources() {
+ export default function LiveSources({ mode = "producer" }) {
+   const isProducer = mode === "producer";
+   const isReporter = mode === "reporter";
+   
    const [sources, setSources] = useState([]);
    // ... all existing state
    
    return (
      <ModulePage
-       title="Live Sources Control Room"
-       subtitle="Monitor reporters..."
+       title={isProducer 
+         ? "Live Sources Control Room" 
+         : "Reporter Studio"}
+       subtitle={isProducer 
+         ? "Monitor reporters..." 
+         : "Broadcast your camera and microphone..."}
        // ... rest of props unchanged
      >
        {({ searchValue, activeFilter }) => (
          <>
            <LiveKitRoomManager {...} />
            <section>{/* Participants */}</section>
            
+           {isProducer && (
              <section>{/* Source cards */}</section>
              <section>{/* Source table */}</section>
+           )}
          </>
        )}
      </ModulePage>
    );
  }
```

**Changes:**
- Add `mode` prop with default "producer"
- Wrap source inventory in `{isProducer && (...)}`
- Update title/subtitle based on mode
- All LiveKit logic unchanged

---

### Phase 2: Add Reporter Route (30 minutes)

**File:** `frontend/src/routes/router.jsx`

```javascript
{
  path: "reporter-studio",
  element: <LiveSources mode="reporter" />,  // or <ReporterStudio />
}
```

**File:** `frontend/src/components/layout/AppShell.jsx` (if sidebar needed)

```javascript
// Add menu item for reporter role only
{
  label: "Reporter Studio",
  path: "/reporter-studio",
  roles: [ROLES.REPORTER]
}
```

---

### Phase 3: Add Backend CORS (30 minutes)

**File:** `backend/src/middleware/corsMiddleware.js` (NEW)

```javascript
export function corsMiddleware(req, res, next) {
  res.header("Access-Control-Allow-Origin", "https://reporter.telemab.com");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
}
```

**File:** `backend/src/app.js` (MODIFY)

```javascript
// Add before other middleware
app.use(corsMiddleware);
```

---

## Complete Workflow Verification ✅

### Reporter Login Flow
```
1. Reporter opens https://reporter.telemab.com
2. Redirects to Login page (existing)
3. Enters credentials
4. authService.login() → JWT token obtained
5. AuthContext stores token
6. Redirected to /reporter-studio
7. LiveSources.jsx renders with mode="reporter"
8. User clicks "Join Room"
9. liveSourcesService.joinLiveKitRoom({ roomName, identity: "reporter-123", role: "reporter" })
10. Backend: POST /media/sessions/join
11. Backend: LiveKitProvider generates JWT with role: "reporter" metadata
12. Frontend: roomClient.connect(wsUrl, token)
13. LiveKit establishes WebSocket connection
14. Frontend: publishCamera(true), publishMicrophone(true)
15. LiveKit broadcasts reporter's tracks to room
16. Producer (in ProducerControlRoom/LiveSources with mode="producer") sees reporter in ParticipantGrid
17. Producer can monitor connection quality, network stats, mute/unmute if needed
```

**No gaps.** Complete end-to-end.

---

## What Needs to Happen for Reporter Portal (External)

| Item | Status | Notes |
|---|---|---|
| **1. Reporter can login** | ✅ | AuthContext works external domain |
| **2. Get LiveKit token** | ✅ | Backend endpoint exists + works |
| **3. Connect to room** | ✅ | liveKitService.joinRoom() works |
| **4. Publish camera** | ✅ | publishCamera() works |
| **5. Publish microphone** | ✅ | publishMicrophone() works |
| **6. Producer sees reporter** | ✅ | ParticipantGrid works |
| **7. Permission request UI** | ⚠️ | Need PermissionGate wrapper (80 lines) |
| **8. CORS for external domain** | ⚠️ | Need corsMiddleware (30 lines) |
| **9. Security headers** | ⚠️ | Need securityHeadersMiddleware (20 lines) |
| **10. Nginx reverse proxy** | ⚠️ | Infrastructure setup |

---

## Recommendation: Single Component, Producer + Reporter Modes

**Implementation Cost:** ~2 hours  
**Code Changes:** 
- LiveSources.jsx: 20 lines added (mode prop + conditional render)
- router.jsx: 3 lines (new route)
- corsMiddleware.js: 15 lines (new)
- app.js: 2 lines (add middleware)

**Reuse:** 100% of existing LiveKit workflow

**Next Step:** 
1. ✅ Approve mode-based approach
2. 📝 Refactor LiveSources.jsx with mode prop
3. 🎨 Add PermissionGate component (camera/mic access)
4. 🚀 Deploy with Nginx proxy

Ready to implement?
