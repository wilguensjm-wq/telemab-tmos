# Issue #3: Camera Publishing Diagnostic Collection

**Goal:** Collect complete evidence during a single camera publish attempt to identify the root cause.

**Freeze Status:** Feature development frozen. Only diagnostic collection and minimal fixes permitted.

---

## Diagnostic Capture Procedure

### Prerequisites
1. ✅ Backend running and healthy (already verified - 130+ min uptime)
2. ✅ Frontend built with comprehensive logging (deployed)
3. Camera hardware connected and functioning
4. Browser: Chrome/Firefox with DevTools available

### Step 1: Open Reporter Portal with DevTools

1. Navigate to: `http://100.116.180.23:5173/reporter-control/reporter-portal`
2. Open DevTools: Press **F12** (or Right-click → Inspect)
3. Switch to **Console** tab
4. **Enable console filtering** (optional but recommended):
   - Type in console filter: `[DIAGNOSTIC]` 
   - This will show only diagnostic output

### Step 2: Join a Session

1. In the Reporter Portal UI, initiate or join a broadcast session
2. Verify connection is established (check backend logs show `POST /api/media/rooms` with 200 status)
3. Wait for UI to show "Connected" status

### Step 3: Trigger Camera Publish

1. In the Reporter Portal UI, click the **Camera On/Enable** button
2. Browser will prompt for camera permission:
   - **If "Allow"**: Grant permission and proceed
   - **If "Block"**: Note this and try again with permission granted
3. **DO NOT CLOSE DevTools** - logs will be preserved

### Step 4: Capture Console Output

**IMPORTANT:** The diagnostic logs will print in sequence with this pattern:
```
[DIAGNOSTIC] ========== CAMERA PUBLISH DIAGNOSTIC START ==========
[DIAGNOSTIC] 1. BROWSER PERMISSION STATE
[DIAGNOSTIC] 2. DEVICE ENUMERATION
[DIAGNOSTIC] 3. CREATE LOCAL VIDEO TRACK
[DIAGNOSTIC] 4. ROOM STATE BEFORE PUBLISH
[DIAGNOSTIC] 5. LOCAL PARTICIPANT STATE BEFORE PUBLISH
[DIAGNOSTIC] 6. WEBSOCKET STATE BEFORE PUBLISH
[DIAGNOSTIC] 7. PUBLISH TRACK
[DIAGNOSTIC] 8. ROOM STATE AFTER PUBLISH
[DIAGNOSTIC] 9. LOCAL PARTICIPANT STATE AFTER PUBLISH
[DIAGNOSTIC] ========== CAMERA PUBLISH DIAGNOSTIC END (SUCCESS or FAILED) ==========
```

**To capture all logs:**

#### Option A: Copy from Console (Easiest)
1. Right-click in the Console
2. Select "Save as..." to download console output
3. Save as `camera_diagnostic_[timestamp].log`

#### Option B: Manual Copy
1. Select all console text: **Ctrl+A** 
2. Copy: **Ctrl+C**
3. Paste into a text file
4. Save as `camera_diagnostic_[timestamp].log`

#### Option C: Export via DevTools
1. Click the **Settings** gear icon in DevTools
2. Navigate to **Experiments** tab
3. Enable "Console Importer"
4. In Console, type: `copy(document.body.innerText)` 
5. Paste into file

### Step 5: Record Success/Failure State

**After camera publish attempt:**

1. Check if camera stream appears in UI:
   - **✅ YES**: Mark as "PUBLISH_SUCCESS"
   - **❌ NO**: Mark as "PUBLISH_FAILED"

2. Check for error message in UI:
   - If present, note exact text

3. Note camera state in bottom-left corner:
   - "Camera On" or "Camera Off"

---

## Diagnostic Output Guide

Each section will output specific data. Here's what to look for:

### 1. Browser Permission State
```
[DIAGNOSTIC] - Camera permission query result: { state: "granted|denied|prompt", ... }
```
**Expected:** `state: "granted"`
**If different:** Browser permission issue detected

### 2. Device Enumeration
```
[DIAGNOSTIC] - Total devices found: N
[DIAGNOSTIC] - Camera devices found: M
[DIAGNOSTIC] - Camera 0: { label: "...", deviceId: "..." }
```
**Expected:** At least 1 camera device found
**If zero:** Hardware/driver issue

### 3. Create Local Video Track
```
[DIAGNOSTIC] - Track created successfully
[DIAGNOSTIC] - Track properties: { sid: "...", state: "live", mediaStreamTrack: {...} }
```
**Expected:** `state: "live"` and `readyState: "live"`
**If different:** Track creation failed or incomplete

### 4. Room State Before Publish
```
[DIAGNOSTIC] - Room state: { name: "...", videoPublished: 0, ... }
```
**Expected:** `videoPublished: 0` (no existing video tracks)

### 5. Local Participant State Before Publish
```
[DIAGNOSTIC] - LocalParticipant: { videoTracks: 0, audioTracks: 0, ... }
```
**Expected:** All track counts = 0 before publish

### 6. WebSocket State
```
[DIAGNOSTIC] - WebSocket: { isConnected: true, wsConnected: true, ... }
```
**Expected:** Both `isConnected` and `wsConnected` = `true`
**If false:** Connection issue during publish

### 7. Publish Track Result
```
[DIAGNOSTIC] - publishTrack() returned: { sid: "...", state: "..." }
```
**Expected:** Returns successfully with `state: "live"`
**If error:** Exception will appear in next section

### 8 & 9. State After Publish
```
[DIAGNOSTIC] - Room state: { videoPublished: 1, ... }
[DIAGNOSTIC] - Video track 0 after publish: { state: "live", ... }
```
**Expected:** `videoPublished: 1` and track state = "live"

### Exception Details (if failed)
```
[DIAGNOSTIC] EXCEPTION DETAILS: {
  name: "...",
  message: "...",
  fullStack: "..."
}
```

---

## What Each Data Point Reveals

| Data Point | Indicates | If Missing/Wrong |
|------------|-----------|-----------------|
| **Permission state** | Browser permission grant | Permissions issue or user denial |
| **Device enumeration** | Hardware detection | Camera not found or driver issue |
| **createLocalVideoTrack() result** | WebRTC track creation | API failure or constraints mismatch |
| **publishTrack() result** | Backend publish attempt | Publishing API failure |
| **Room state before/after** | Room-level consistency | State sync issue or race condition |
| **LocalParticipant state** | Participant track management | Participant state mismatch |
| **WebSocket state** | Connection stability | Connection dropped during publish |
| **Exception stack trace** | Root cause of failure | JavaScript error details |

---

## Root Cause Scenarios

Based on diagnostic output, one of these will be revealed:

### Scenario 1: Permission Denied
- **Evidence:** `state: "denied"` in permission state
- **Fix:** User grants permission and reloads page

### Scenario 2: No Camera Hardware
- **Evidence:** `Camera devices found: 0` in device enumeration
- **Fix:** User connects camera or enables in BIOS

### Scenario 3: Track Creation Failed
- **Evidence:** `createLocalVideoTrack() failed:` with error details
- **Possible causes:** 
  - Constraints not supported
  - Hardware in use
  - Browser bug

### Scenario 4: Publish Failed
- **Evidence:** `publishTrack() failed:` with error details
- **Possible causes:**
  - Backend endpoint error
  - LiveKit room issue
  - Network timeout

### Scenario 5: Connection Lost During Publish
- **Evidence:** `isConnected: false` or `wsConnected: false` in WebSocket state section
- **Fix:** Reconnection handler or explicit reconnect

### Scenario 6: State Mismatch
- **Evidence:** `videoPublished: 0` after publish or track count mismatch
- **Possible causes:**
  - Race condition
  - State sync issue
  - Event listener not firing

### Scenario 7: Other Exception
- **Evidence:** `name:` and `message:` fields with unexpected error
- **Action:** Full stack trace will indicate exact failure point

---

## How to Submit Evidence

Once diagnostic logs are captured:

1. **Save console output** to file (see Step 4 above)
2. **Note the outcome:**
   - Camera publish: SUCCESS or FAILED
   - Expected vs actual behavior
   - UI state after attempt
3. **Provide:**
   - Diagnostic log file
   - Browser type and version
   - Camera model (if known)
   - OS and any relevant system info

---

## Recovery: Return Frontend to Normal Logging

After diagnostic collection, to restore normal logging:

```bash
# Rebuild frontend with normal logging
cd /home/telemab/docker/tmos/frontend
npm run build
npm run dev
```

The diagnostic logging is preserved in `liveKitService.js` and can be toggled by filtering `[DIAGNOSTIC]` in DevTools console.

---

## Important Notes

- **No Speculative Fixes:** Evidence collection only—do not apply fixes until root cause is identified
- **Single Attempt:** Capture one full publish attempt in each session
- **Complete Output:** Preserve all `[DIAGNOSTIC]` lines from START to END markers
- **Exact Timing:** Logs include timestamps for sequence analysis
- **WebSocket Monitoring:** Note any `wsConnected: false` messages—indicates disconnection during operation
- **Exception Details:** Full stack trace is critical for pinpointing exact failure location

---

## Quick Reference: Expected Success Output

```
[DIAGNOSTIC] ========== CAMERA PUBLISH DIAGNOSTIC START ==========
[DIAGNOSTIC] 1. BROWSER PERMISSION STATE
[DIAGNOSTIC] - Camera permission query result: { state: "granted", ... }
[DIAGNOSTIC] 2. DEVICE ENUMERATION
[DIAGNOSTIC] - Total devices found: N
[DIAGNOSTIC] - Camera devices found: 1+
[DIAGNOSTIC] - Camera 0: { label: "(name)", ... }
[DIAGNOSTIC] 3. CREATE LOCAL VIDEO TRACK
[DIAGNOSTIC] - Track created successfully
[DIAGNOSTIC] - Track properties: { state: "live", ... }
[DIAGNOSTIC] 7. PUBLISH TRACK
[DIAGNOSTIC] - publishTrack() returned: { state: "live", ... }
[DIAGNOSTIC] 9. LOCAL PARTICIPANT STATE AFTER PUBLISH
[DIAGNOSTIC] - Video track 0 after publish: { state: "live", ... }
[DIAGNOSTIC] ========== CAMERA PUBLISH DIAGNOSTIC END (SUCCESS) ==========
```

If output diverges from this pattern, the divergence point indicates the root cause.
