# TMOS Checkpoint Release Notes

## Milestone

- Commit: a4ead35c455d69bc51f2db627994d996b91f3734
- Title: TMOS: unify local runtime startup, fix LiveKit healthcheck, harden Vite proxy, add API smoke validation
- Scope: local development baseline hardening for TMOS frontend/backend runtime

## Included In This Checkpoint

### Runtime and orchestration

- Added a single-command startup workflow:
  - `npm run dev:tmos`
  - `npm run dev:tmos:status`
  - `npm run dev:tmos:api-smoke`
  - `npm run dev:tmos:down`
- Added operational scripts:
  - `ops/dev-up.sh`
  - `ops/dev-down.sh`
  - `ops/dev-status.sh`
  - `ops/api-smoke.sh`
- Added Make targets for the same workflows:
  - `make tmos-up`
  - `make tmos-status`
  - `make tmos-api-smoke`
  - `make tmos-down`

### Service health and configuration

- Fixed LiveKit Docker healthcheck to use a command available in the container image (`wget`), replacing the previous `curl` probe.
- Aligned backend example port to `8081` in `backend/.env.example` to match frontend proxy assumptions.
- Added configurable frontend proxy target (`TMOS_BACKEND_PROXY_TARGET`) and enabled websocket proxy support in Vite.

### Documentation

- Updated root startup guidance in `README.md`.
- Added TMOS v1 runtime guidance and validation commands in `QUICK_START.md`.

### Frontend quality and dependencies

- Removed one unused import in router (`frontend/src/routes/router.jsx`).
- Updated frontend lockfile/dependency set to include patched PostCSS line (`8.5.23`) and corresponding transitive updates.

## Files In Commit

- Makefile
- QUICK_START.md
- README.md
- backend/.env.example
- docker-compose.yml
- frontend/.env.example
- frontend/package-lock.json
- frontend/package.json
- frontend/src/routes/router.jsx
- frontend/vite.config.js
- ops/api-smoke.sh
- ops/dev-down.sh
- ops/dev-status.sh
- ops/dev-up.sh
- package.json

## Validation Performed

- Clean stop/start validation passed using new scripts.
- Service health checks passed:
  - frontend (5173)
  - backend (8081)
  - postgres (healthy)
  - livekit (healthy)
- API smoke passed: `128` routes resolved as non-404.
- Login flow passed: `/login` to `/dashboard`.
- Major route navigation passed.
- Backend tests passed.
- Frontend production build passed (warnings only, no failure).

## Security and Publishing Review

No production secrets or private keys were found in committed files.

Development-only values were found and are acceptable for a dev checkpoint, but must not be used in production:

- `docker-compose.yml`: `POSTGRES_PASSWORD=postgres`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=devsecret`
- `backend/.env.example`: placeholder/default auth and token fields
- `ops/api-smoke.sh`: local dev login uses `operator/operator`
- `QUICK_START.md`: sample login payload includes `admin123` placeholder example

## Production Hardening Follow-ups

Before any production or public deployment:

- Replace all development credentials and keys.
- Disable or override bootstrap/default credentials.
- Move secrets to managed secret storage (vault/secret manager) and avoid static credentials in compose docs.
- Remove or gate dev-only helper authentication assumptions in scripts.

## Recommended Tag

- `v1.0.0-dev-baseline`

Alternative acceptable tags:

- `v1.0.0-checkpoint-runtime-stable`
- `v1.0.0-internal-baseline`
