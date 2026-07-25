#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${TMOS_BACKEND_URL:-http://127.0.0.1:8081}"

token="$((
  curl -sS -X POST "$BACKEND_URL/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"operator","password":"operator"}'
) | node -pe "const s=require('fs').readFileSync(0,'utf8'); try{const j=JSON.parse(s); j.data?.accessToken||''}catch{''}")"

if [[ -z "$token" ]]; then
  echo "[tmos] API smoke failed: unable to obtain auth token" >&2
  exit 1
fi

cd "$ROOT_DIR"
TMOS_AUDIT_TOKEN="$token" TMOS_BACKEND_URL="$BACKEND_URL" node --input-type=module <<'EOF'
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const src = fs.readFileSync('backend/src/routes/v1.js', 'utf8');
const routes = [];

for (const m of src.matchAll(/router\.(get|post|patch|delete)\("([^"]+)"/g)) {
  routes.push({ method: m[1].toUpperCase(), path: m[2] });
}

for (const m of src.matchAll(/const unavailable(?:Get|Post)Routes = \[(.*?)\];/gs)) {
  const method = m[0].includes('unavailableGetRoutes') ? 'GET' : 'POST';
  for (const p of m[1].matchAll(/\["([^"]+)"\s*,/g)) {
    routes.push({ method, path: p[1] });
  }
}

const uniqueRoutes = [...new Map(routes.map((r) => [`${r.method} ${r.path}`, r])).values()];

function samplePath(path) {
  return path
    .replace(':vmId', '101')
    .replace(':action', 'start')
    .replace(':id', 'session-1')
    .replace(':participantId', 'participant-1')
    .replace(':reporterId', 'rep-1')
    .replace(':studioId', 'studio-1')
    .replace(':assignmentId', 'assignment-1');
}

const token = process.env.TMOS_AUDIT_TOKEN;
const backendUrl = process.env.TMOS_BACKEND_URL;

const failures = [];
for (const route of uniqueRoutes) {
  const path = samplePath(route.path);
  const url = `${backendUrl}/api/v1${path}`;

  const base = [
    'curl',
    '-s',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '-H',
    `'Authorization: Bearer ${token}'`,
  ];

  if (route.method !== 'GET') {
    base.push('-X', route.method, '-H', `'Content-Type: application/json'`, '-d', "'{}'");
  }

  base.push(`'${url}'`);

  let code = '000';
  try {
    code = execSync(base.join(' '), { encoding: 'utf8' }).trim();
  } catch {
    code = '000';
  }

  if (code === '404' || code === '000') {
    failures.push(`${route.method} ${path} => ${code}`);
  }
}

if (failures.length) {
  console.error(`[tmos] API smoke failed: ${failures.length} routes unresolved`);
  for (const line of failures.slice(0, 30)) {
    console.error(line);
  }
  process.exit(1);
}

console.log(`[tmos] API smoke passed: ${uniqueRoutes.length} routes resolved (non-404)`);
EOF
