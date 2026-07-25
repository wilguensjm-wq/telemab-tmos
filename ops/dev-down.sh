#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/tmp/dev-stack"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "[tmos] ${label} pid file not found, skipping."
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    echo "[tmos] Stopping ${label} (pid ${pid})..."
    kill "$pid" >/dev/null 2>&1 || true
  else
    echo "[tmos] ${label} process not running, cleaning stale pid file."
  fi

  rm -f "$pid_file"
}

echo "[tmos] Stopping local frontend/backend processes..."
stop_pid_file "$FRONTEND_PID_FILE" "frontend"
stop_pid_file "$BACKEND_PID_FILE" "backend"

echo "[tmos] Stopping infrastructure (postgres, livekit)..."
docker compose -f "$ROOT_DIR/docker-compose.yml" down

echo "[tmos] Shutdown complete"
