#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <reporter_domain> <producer_domain> <livekit_ws_url>"
  exit 1
fi

reporter_domain="$1"
producer_domain="$2"
livekit_ws_url="$3"

echo "[1/6] Checking reporter domain resolves..."
getent hosts "$reporter_domain" >/dev/null || {
  echo "ERROR: reporter domain does not resolve: $reporter_domain"
  exit 1
}

echo "[2/6] Checking producer domain resolves..."
getent hosts "$producer_domain" >/dev/null || {
  echo "ERROR: producer domain does not resolve: $producer_domain"
  exit 1
}

echo "[3/6] Validating LiveKit URL format..."
if [[ ! "$livekit_ws_url" =~ ^wss:// ]]; then
  echo "ERROR: LiveKit URL must start with wss://"
  exit 1
fi

livekit_host="${livekit_ws_url#wss://}"
livekit_host="${livekit_host%%/*}"

if [[ "$livekit_host" == "localhost" || "$livekit_host" == *.local ]]; then
  echo "ERROR: LiveKit host must be publicly reachable, not localhost/.local"
  exit 1
fi

echo "[4/6] Checking LiveKit host resolves..."
getent hosts "$livekit_host" >/dev/null || {
  echo "ERROR: LiveKit host does not resolve: $livekit_host"
  exit 1
}

echo "[5/6] Checking required local ports (nginx/backend/livekit) are not in conflict..."
for port in 80 443 8081 7880 7881; do
  if ss -ltn "( sport = :$port )" | grep -q LISTEN; then
    echo "WARN: port $port is already in use"
  fi
done

echo "[6/6] Verifying HTTPS endpoints are reachable..."
curl -fsSI "https://$reporter_domain" >/dev/null || {
  echo "ERROR: reporter HTTPS endpoint not reachable: https://$reporter_domain"
  exit 1
}
curl -fsSI "https://$producer_domain" >/dev/null || {
  echo "ERROR: producer HTTPS endpoint not reachable: https://$producer_domain"
  exit 1
}

echo "Preflight checks complete."
echo "Next: execute phased validation (producer laptop, cellular reporter, external network expansion)."
