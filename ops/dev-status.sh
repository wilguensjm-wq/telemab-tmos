#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

check_url() {
  local url="$1"
  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "UP"
  else
    echo "DOWN"
  fi
}

echo "TMOS Runtime Status"
echo "-------------------"
echo "Frontend (5173): $(check_url http://127.0.0.1:5173)"
echo "Backend (8081):  $(check_url http://127.0.0.1:8081/api/v1/health)"

postgres_health="$(docker inspect --format '{{.State.Health.Status}}' tmos-postgres 2>/dev/null || echo missing)"
livekit_health="$(docker inspect --format '{{.State.Health.Status}}' tmos-livekit 2>/dev/null || echo missing)"

echo "Postgres:        ${postgres_health}"
echo "LiveKit:         ${livekit_health}"

echo ""
echo "Compose services"
docker compose -f "$ROOT_DIR/docker-compose.yml" ps
