# Camera/Microphone Publishing Debugging Guide

## Objective
Diagnose and fix the Issue #3 (Reporter disconnects after camera publish attempt) by:
1. Running workflow tests with enhanced logging
2. Capturing browser console output
3. Documenting findings for root cause analysis
4. Implementing targeted fixes

## Enhanced Features Added
- **Media Device Detection:** Pre-flight checks for available camera/microphone
- **Browser Permissions Checking:** Verify permission state before attempting publish
- **Comprehensive Logging:** Every step logged with [liveKitService] prefix
- **Connection State Monitoring:** Detects unexpected disconnections during media operations
- **Enhanced Error Messages:** Clear error descriptions for user troubleshooting

## Test Procedure

### Setup
1. Open browser console (F12 or DevTools)
2. Enable "Preserve log" in console settings
3. Open ReporterPortal: http://100.116.180.23:5173/reporter-control/reporter-portal
4. Open ProducerControlRoom in second tab: http://100.116.180.23:5173/reporter-control/producer
5. Arrange windows side-by-side for visibility

### Test 1: Reporter Join (Baseline)
**Expected:** Reporter connects successfully, Producer sees participant count increase

```
Steps:
1. ReporterPortal: Enter identity "test-reporter-1"
2. Click "Join Broadcast Room"
3. Wait for "CONNECTED" status
4. Producer tab: Verify "Live Now" count = 2 (producer + reporter)

Expected Logs:
✅ [liveKitService] joinRoom called
✅ [liveKitService] room created/fetched
✅ [liveKitService] ConnectionStateChanged: { state: 'connected' }
✅ [liveKitService] ParticipantConnected: { identity: 'producer' }
```

### Test 2: Camera Publishing with Logging
**Expected:** Camera publishes successfully OR detailed error message shown

```
Steps:
1. From Test 1 connected state
2. ReporterPortal: Click "Start Camera" button
3. Watch browser console for errors
4. Observe connection status and producer queue

Expected Success Logs:
✅ [liveKitService] publishCamera called: { enabled: true }
✅ [liveKitService] Pre-flight checks for camera...
✅ [MediaDeviceHelper] Checking for videoinput devices...
✅ [MediaDeviceHelper] Found N videoinput device(s)
✅ [PermissionHelper] Checking camera permission...
✅ [PermissionHelper] camera permission state: granted
✅ [liveKitService] Creating local video track...
✅ [liveKitService] Video track created successfully
✅ [liveKitService] Publishing video track to room...
✅ [liveKitService] Video track published successfully
✅ [liveKitService] LocalTrackPublished: { trackSid: 'TR_...', trackKind: 'video' }
✅ ReporterPortal: Status shows "CONNECTED"

Expected Failure Scenarios:
❌ No camera found: "[MediaDeviceHelper] Found 0 videoinput device(s)"
   → ACTION: Check physical camera connection, restart browser
   
❌ Permission denied: "[PermissionHelper] camera permission state: denied"
   → ACTION: Check browser camera permissions, clear permissions, reload
   
❌ Device in use: "createLocalVideoTrack failed: NotAllowedError: Could not start video source"
   → ACTION: Close other applications using camera (Zoom, Teams, etc.)

❌ Track creation fails: "[liveKitService] Failed to publish camera: <error>"
   → ACTION: Note error message, check browser console for stack trace
```

### Test 3: Disconnection Monitoring
**Purpose:** Detect if connection drops after camera publish

```
Steps:
1. From camera publish success
2. Monitor connection state for 5 seconds
3. Check "Live Now" count in Producer tab

Expected:
✅ ReporterPortal: Shows "CONNECTED" status
✅ Producer: "Live Now" count = 2
✅ Producer: Reporter shows video icon enabled
❌ FAILURE: Connection drops → see "ConnectionStateChanged: { state: 'disconnected' }"
```

### Test 4: Microphone Publishing
**Expected:** Microphone publishes without issues (similar to camera)

```
Steps:
1. From camera publish success
2. ReporterPortal: Click "Start Microphone" button
3. Watch console logs

Expected Success Logs:
✅ [liveKitService] publishMicrophone called: { enabled: true }
✅ [MediaDeviceHelper] Checking for audioinput devices...
✅ [liveKitService] Creating local audio track...
✅ [liveKitService] Audio track published successfully
```

### Test 5: State Persistence
**Purpose:** Verify backend device state updates

```
Steps:
1. Camera enabled in ReporterPortal
2. Refresh page
3. Verify camera state persists (button shows "Stop Camera")

Expected:
✅ Before refresh: "Stop Camera" button visible
✅ After refresh: Reporter rejoins
✅ Camera state remembered
```

## Console Log Interpretation Guide

### Connection-Related Logs
```
✅ ConnectionStateChanged: { state: 'connected' }
   → Healthy connection established

❌ ConnectionStateChanged: { state: 'disconnected' }
   → Connection lost (problematic after media publish)

⚠️ ConnectionStateChanged: { state: 'reconnecting' }
   → Attempting to recover connection
```

### Media Track Logs
```
✅ LocalTrackPublished: { trackKind: 'video' }
   → Camera successfully published

❌ LocalTrackUnpublished: { trackKind: 'video' }
   → Camera suddenly unpublished (unexpected)

❌ RoomFinished event
   → Room connection terminated
```

### Participant Logs
```
✅ ParticipantConnected: { identity: 'producer' }
   → Remote participant joined

❌ ParticipantDisconnected: { identity: 'test-reporter-1' }
   → This participant (self) disconnected
```

## Common Issues & Quick Fixes

| Symptom | Logs | Fix |
|---------|------|-----|
| No camera found | `Found 0 videoinput device(s)` | Check hardware, restart browser |
| Permission denied | `permission state: denied` | Chrome Settings → Privacy → Camera → Enable |
| Camera in use | `NotAllowedError: Could not start video source` | Close Zoom/Teams/other camera apps |
| Connection drops | `ConnectionStateChanged: disconnected` | See ISSUE #3 Analysis section |
| No logs at all | (none) | Check F12 console filter isn't hiding logs |

## Data Collection for Issue #3

When camera publish fails:
1. **Take screenshot** of error message in ReporterPortal
2. **Copy full console output** (select all logs, Ctrl+C)
3. **Note browser version** (Chrome, Firefox, Safari, etc.)
4. **Check OS** (Linux, Windows, macOS)
5. **List active applications** that might use camera

## Next Steps After Testing

### If Camera/Microphone Works:
- ✅ Proceed to multi-reporter testing
- ✅ Test producer approve/reject workflow
- ✅ Prepare for production deployment

### If Camera/Microphone Fails:
- 📋 Document exact error from console
- 🔍 Analyze logs using "Common Issues" table above
- 🛠️ Implement targeted fix based on error type
- 🔄 Retest with fix
- 📝 Update BROADCAST_WORKFLOW_VALIDATION_LOG.md

## Files Modified for Debugging

- `frontend/src/services/liveKitService.js`
  - Added media device check helpers
  - Added permission check helpers
  - Enhanced publishCamera() with pre-flight checks
  - Enhanced publishMicrophone() with pre-flight checks
  - Enhanced bindRoomEvents() with detailed logging

- `frontend/src/pages/ReporterPortal.jsx`
  - Enhanced handleToggleCamera() with connection monitoring
  - Enhanced handleToggleMicrophone() with connection monitoring
  - Better error messages to user

## Success Criteria

✅ **Complete** when:
1. Camera publishes successfully and connection stays active
2. Microphone publishes successfully and connection stays active
3. Producer sees reporter in "Live Now" with camera/mic indicators
4. Browser console shows all expected success logs
5. No "disconnected" events occur after media publish
6. Error messages are clear and actionable
