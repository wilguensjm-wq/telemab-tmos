#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/tmp/dev-stack"
LOG_DIR="$STATE_DIR/logs"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"

mkdir -p "$LOG_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_port_listening() {
  local port="$1"
  ss -ltn | grep -q ":${port} "
}

is_pid_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local max_attempts="${3:-30}"
  local attempt=1

  until curl -fsS "$url" >/dev/null 2>&1; do
    if (( attempt >= max_attempts )); then
      echo "${label} did not become ready: ${url}" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 0
}

assert_expected_service_on_port() {
  local port="$1"
  local probe_url="$2"
  local label="$3"

  if ! is_port_listening "$port"; then
    return 0
  fi

  if curl -fsS "$probe_url" >/dev/null 2>&1; then
    return 0
  fi

  echo "[tmos] Port ${port} is in use by an unexpected process; expected ${label}." >&2
  echo "[tmos] Resolve the conflict and rerun startup." >&2
  exit 1
}

require_cmd docker
require_cmd npm
require_cmd curl
require_cmd ss

echo "[tmos] Starting infrastructure (postgres, livekit)..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres livekit

echo "[tmos] Waiting for postgres health..."
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' tmos-postgres 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 1
done

postgres_status="$(docker inspect --format '{{.State.Health.Status}}' tmos-postgres 2>/dev/null || echo unknown)"
if [[ "$postgres_status" != "healthy" ]]; then
  echo "[tmos] postgres health is '${postgres_status}' (continuing, backend startup may fail until healthy)."
fi

assert_expected_service_on_port 8081 "http://127.0.0.1:8081/api/v1/health" "TMOS backend"
assert_expected_service_on_port 5173 "http://127.0.0.1:5173" "TMOS frontend"

if is_pid_running "$BACKEND_PID_FILE"; then
  echo "[tmos] backend already running (pid $(cat "$BACKEND_PID_FILE"))."
elif is_port_listening 8081; then
  echo "[tmos] port 8081 already in use; assuming backend is managed externally."
else
  echo "[tmos] Starting backend on 8081..."
  (
    cd "$ROOT_DIR/backend"
    nohup npm run dev >"$LOG_DIR/backend.log" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )
fi

if is_pid_running "$FRONTEND_PID_FILE"; then
  echo "[tmos] frontend already running (pid $(cat "$FRONTEND_PID_FILE"))."
elif is_port_listening 5173; then
  echo "[tmos] port 5173 already in use; assuming frontend is managed externally."
else
  echo "[tmos] Starting frontend on 5173..."
  (
    cd "$ROOT_DIR/frontend"
    nohup npm run dev >"$LOG_DIR/frontend.log" 2>&1 &
    echo $! >"$FRONTEND_PID_FILE"
  )
fi

echo "[tmos] Waiting for backend readiness..."
wait_for_http "http://127.0.0.1:8081/api/v1/health" "backend" 60

echo "[tmos] Waiting for frontend readiness..."
wait_for_http "http://127.0.0.1:5173" "frontend" 60

echo "[tmos] Startup complete"
echo "[tmos] Frontend: http://localhost:5173"
echo "[tmos] Backend:  http://localhost:8081/api/v1/health"
echo "[tmos] Logs:     $LOG_DIR"
