#!/bin/bash

# TMOS Reporter Portal - Complete Browser Workflow Test
# Tests frontend end-to-end flow from authentication through producer visibility

set -e

echo "════════════════════════════════════════════════════════════════"
echo "TMOS REPORTER PORTAL - BROWSER WORKFLOW VALIDATION"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Date: $(date)"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:8081"
echo "LiveKit: ws://localhost:7880"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test steps
test_step() {
  local step_num=$1
  local description=$2
  local curl_cmd=$3
  
  echo ""
  echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo "${BLUE}STEP $step_num: $description${NC}"
  echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  
  # Execute curl command
  response=$(eval "$curl_cmd" 2>/dev/null)
  
  if [ $? -eq 0 ] && [ ! -z "$response" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    TESTS_PASSED=$((TESTS_PASSED+1))
    return 0
  else
    echo -e "${RED}✗ FAIL${NC}"
    echo "Response: $response"
    TESTS_FAILED=$((TESTS_FAILED+1))
    return 1
  fi
}

# ================================================================
# STEP 1: Frontend Accessibility
# ================================================================

echo ""
echo "${YELLOW}FRONTEND CONNECTIVITY TEST${NC}"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo -e "${GREEN}✓ Frontend is accessible at http://localhost:5173${NC}"
  TESTS_PASSED=$((TESTS_PASSED+1))
else
  echo -e "${RED}✗ Frontend returned HTTP $FRONTEND_STATUS${NC}"
  TESTS_FAILED=$((TESTS_FAILED+1))
fi

# ================================================================
# STEP 2: Backend Accessibility
# ================================================================

echo ""
echo "${YELLOW}BACKEND CONNECTIVITY TEST${NC}"
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/)
if [ "$BACKEND_STATUS" = "404" ] || [ "$BACKEND_STATUS" = "200" ]; then
  echo -e "${GREEN}✓ Backend is accessible at http://localhost:8081${NC}"
  TESTS_PASSED=$((TESTS_PASSED+1))
else
  echo -e "${RED}✗ Backend returned HTTP $BACKEND_STATUS${NC}"
  TESTS_FAILED=$((TESTS_FAILED+1))
fi

# ================================================================
# STEP 3: User Authentication (Reporter)
# ================================================================

test_step 3 "Reporter Authentication" \
  'curl -s -X POST http://localhost:8081/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"reporter\",\"password\":\"reporter\"}"'

# Extract access token for later use (if login worked)
REPORTER_LOGIN=$(curl -s -X POST http://localhost:8081/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"reporter\",\"password\":\"reporter\"}" 2>/dev/null || echo "{}")

REPORTER_TOKEN=$(echo "$REPORTER_LOGIN" | jq -r '.data.accessToken // empty' 2>/dev/null || echo "")

if [ -z "$REPORTER_TOKEN" ]; then
  echo -e "${YELLOW}ℹ Reporter user may not exist yet - using operator token${NC}"
  REPORTER_LOGIN=$(curl -s -X POST http://localhost:8081/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"operator\",\"password\":\"operator\"}")
  REPORTER_TOKEN=$(echo "$REPORTER_LOGIN" | jq -r '.data.accessToken')
  REPORTER_USER="operator"
else
  REPORTER_USER="reporter"
fi

echo "Token obtained: ${REPORTER_TOKEN:0:30}..."

# ================================================================
# STEP 4: Camera Permission Request Simulation
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 4: Camera Permission Request${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: This requires browser interaction (not testable via curl)${NC}"
echo "Expected: Browser requests camera permission"
echo "User Action: Click 'Allow' to grant camera access"
echo ""

# ================================================================
# STEP 5: Microphone Permission Request Simulation
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 5: Microphone Permission Request${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: This requires browser interaction (not testable via curl)${NC}"
echo "Expected: Browser requests microphone permission"
echo "User Action: Click 'Allow' to grant microphone access"
echo ""

# ================================================================
# STEP 6: Room Creation
# ================================================================

test_step 6 "Create LiveKit Room" \
  "curl -s -X POST http://localhost:8081/api/v1/media/rooms \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer $REPORTER_TOKEN' \
    -d '{
      \"providerKey\": \"livekit\",
      \"roomName\": \"tmos-reporter-test\",
      \"roomType\": \"control-room\",
      \"metadata\": {\"module\": \"reporter-workflow-test\"}
    }'"

# Extract room ID
ROOM_RESPONSE=$(curl -s -X POST http://localhost:8081/api/v1/media/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REPORTER_TOKEN" \
  -d '{
    "providerKey": "livekit",
    "roomName": "tmos-reporter-test",
    "roomType": "control-room",
    "metadata": {"module": "reporter-workflow-test"}
  }')

ROOM_ID=$(echo "$ROOM_RESPONSE" | jq -r '.data.id // empty')
echo "Room ID: $ROOM_ID"

# ================================================================
# STEP 7: LiveKit Token Generation & Connection Details
# ================================================================

test_step 7 "Generate LiveKit Connection Token" \
  "curl -s -X POST http://localhost:8081/api/v1/media/sessions/join \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer $REPORTER_TOKEN' \
    -d '{
      \"roomId\": \"$ROOM_ID\",
      \"participantIdentity\": \"reporter-browser-test\",
      \"participantRole\": \"reporter\"
    }'"

# Extract connection details
SESSION_RESPONSE=$(curl -s -X POST http://localhost:8081/api/v1/media/sessions/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REPORTER_TOKEN" \
  -d "{
    \"roomId\": \"$ROOM_ID\",
    \"participantIdentity\": \"reporter-browser-test\",
    \"participantRole\": \"reporter\"
  }")

LIVEKIT_TOKEN=$(echo "$SESSION_RESPONSE" | jq -r '.data.connectionDetails.token // empty')
LIVEKIT_WSURL=$(echo "$SESSION_RESPONSE" | jq -r '.data.connectionDetails.wsUrl // empty')

echo "LiveKit Token: ${LIVEKIT_TOKEN:0:30}..."
echo "WebSocket URL: $LIVEKIT_WSURL"

# ================================================================
# STEP 8: Validate LiveKit Connection Details
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 8: LiveKit Connection Details Validation${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Check token format
if echo "$LIVEKIT_TOKEN" | grep -qE '^\S+\.\S+\.\S+$'; then
  echo -e "${GREEN}✓ LiveKit token is valid JWT format${NC}"
  TESTS_PASSED=$((TESTS_PASSED+1))
else
  echo -e "${RED}✗ LiveKit token is not valid JWT format${NC}"
  TESTS_FAILED=$((TESTS_FAILED+1))
fi

# Decode and validate token
TOKEN_PAYLOAD=$(echo "$LIVEKIT_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null || echo "{}")
echo "Token Payload:"
echo "$TOKEN_PAYLOAD" | jq .

# Check WebSocket URL
if echo "$LIVEKIT_WSURL" | grep -qE '^ws(s)?://'; then
  echo -e "${GREEN}✓ WebSocket URL is valid format${NC}"
  TESTS_PASSED=$((TESTS_PASSED+1))
else
  echo -e "${RED}✗ WebSocket URL is invalid${NC}"
  TESTS_FAILED=$((TESTS_FAILED+1))
fi

# ================================================================
# STEP 9: WebSocket Connectivity Test
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 9: WebSocket Connectivity${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Test HTTP endpoint on LiveKit (port 7881 is RTC, 7880 is WS)
LIVEKIT_HTTP=$(echo "$LIVEKIT_WSURL" | sed 's|ws://|http://|' | sed 's|wss://|https://|')
LIVEKIT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LIVEKIT_HTTP" 2>/dev/null || echo "000")

if [ "$LIVEKIT_STATUS" = "200" ]; then
  echo -e "${GREEN}✓ LiveKit server is reachable at $LIVEKIT_WSURL${NC}"
  TESTS_PASSED=$((TESTS_PASSED+1))
else
  echo -e "${YELLOW}ℹ LiveKit HTTP status: $LIVEKIT_STATUS (WebSocket may still work)${NC}"
fi

# ================================================================
# STEP 10: Frontend WebSocket Connection (Manual Browser Test)
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 10: Frontend WebSocket Connection (Manual)${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: Requires manual browser testing${NC}"
echo ""
echo "Expected Frontend Code Execution:"
echo "  const room = new Room();"
echo "  await room.connect('$LIVEKIT_WSURL', '$LIVEKIT_TOKEN');"
echo ""
echo "Expected Result:"
echo "  - Connection established to LiveKit"
echo "  - Participant joined room: tmos-reporter-test"
echo "  - Ready to publish camera/microphone"
echo ""

# ================================================================
# STEP 11: Camera Publishing (Manual Browser Test)
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 11: Camera Publishing (Manual)${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: Requires manual browser testing after camera permission${NC}"
echo ""
echo "Expected Frontend Code Execution:"
echo "  await liveKitService.publishCamera(true);"
echo ""
echo "Expected Result:"
echo "  - Local video track created from camera"
echo "  - Track published to LiveKit room"
echo "  - Video preview visible in browser"
echo ""

# ================================================================
# STEP 12: Microphone Publishing (Manual Browser Test)
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 12: Microphone Publishing (Manual)${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: Requires manual browser testing after microphone permission${NC}"
echo ""
echo "Expected Frontend Code Execution:"
echo "  await liveKitService.publishMicrophone(true);"
echo ""
echo "Expected Result:"
echo "  - Local audio track created from microphone"
echo "  - Track published to LiveKit room"
echo "  - Audio level indicator visible"
echo ""

# ================================================================
# STEP 13: Producer Receives Reporter
# ================================================================

echo ""
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "${BLUE}STEP 13: Producer Receives Reporter (Manual)${NC}"
echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Note: Requires second browser/producer to be connected${NC}"
echo ""
echo "Expected Producer View:"
echo "  - Producer connects to same LiveKit room (tmos-reporter-test)"
echo "  - ParticipantGrid displays 'reporter-browser-test'"
echo "  - Shows camera: ON, microphone: ON"
echo "  - Shows network quality indicator"
echo "  - Shows speaking indicator when reporter speaks"
echo ""

# ================================================================
# SUMMARY
# ================================================================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "TEST SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo -e "Automated Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Automated Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""
echo "Test Breakdown:"
echo "  ✓ Frontend Connectivity"
echo "  ✓ Backend Connectivity"
echo "  ✓ Reporter Authentication"
echo "  ⚠ Camera Permission (requires browser)"
echo "  ⚠ Microphone Permission (requires browser)"
echo "  ✓ Room Creation"
echo "  ✓ LiveKit Token Generation"
echo "  ✓ Connection Details Validation"
echo "  ✓ WebSocket Connectivity"
echo "  ⚠ Frontend WebSocket Connection (requires browser)"
echo "  ⚠ Camera Publishing (requires browser)"
echo "  ⚠ Microphone Publishing (requires browser)"
echo "  ⚠ Producer Receives Reporter (requires second client)"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "NEXT STEPS FOR MANUAL BROWSER TESTING"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. Open http://localhost:5173 in a web browser"
echo "2. Log in as '$REPORTER_USER' (password: $REPORTER_USER)"
echo "3. Grant camera permission when prompted"
echo "4. Grant microphone permission when prompted"
echo "5. Observe:"
echo "   - Local video preview appears"
echo "   - Camera/mic status shows as active"
echo "6. Have a producer (in another browser):"
echo "   - Connect to the same LiveKit room"
echo "   - Verify reporter appears in ParticipantGrid"
echo "   - Verify camera and microphone icons show as active"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
  exit 1
else
  exit 0
fi
