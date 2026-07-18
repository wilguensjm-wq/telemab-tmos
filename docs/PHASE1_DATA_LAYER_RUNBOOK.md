# Phase 1 Data Layer Runbook

## Scope
This runbook closes TMOS Phase 1 acceptance for PostgreSQL persistence, migration reliability, backup/recovery, performance validation, and operational readiness.

## Prerequisites
- Docker available on the host.
- PostgreSQL service started from compose:
  - `docker compose up -d postgres`
- Backend environment includes:
  - `TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos`
  - `TMOS_DATABASE_REQUIRED=true`

## Migration Procedure
1. Run migrations:
   - `cd backend && npm run migrate`
2. Verify migration history:
   - `docker exec -i tmos-postgres psql -U postgres -d tmos -c "select * from schema_migrations order by applied_at;"`

### Idempotency Check
Run migration twice:
- `cd backend && TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos npm run migrate`
- `cd backend && TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos npm run migrate`

Expected result:
- Second run reports completion without applying new versions.
- `schema_migrations` row count remains unchanged.

## Clean Deploy From Empty Database
1. Create clean database:
   - `docker exec -i tmos-postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS tmos_clean;"`
   - `docker exec -i tmos-postgres psql -U postgres -d postgres -c "CREATE DATABASE tmos_clean;"`
2. Run a single migration command:
   - `cd backend && TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos_clean npm run migrate`
3. Verify schema created:
   - `docker exec -i tmos-postgres psql -U postgres -d tmos_clean -c "\dt"`

## Rollback Procedure
TMOS rollback for schema/data changes is backup-restore based.

1. Stop write traffic (stop backend or put in maintenance mode).
2. Restore latest known-good backup into target DB.
3. Point backend to restored DB and restart.

Example restore:
- `docker exec -i tmos-postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS tmos_restore;"`
- `docker exec -i tmos-postgres psql -U postgres -d postgres -c "CREATE DATABASE tmos_restore;"`
- `docker exec -i tmos-postgres pg_restore -U postgres -d tmos_restore --clean --if-exists < database/backups/tmos_phase1.dump`

## Backup Procedure
1. Create backup directory:
   - `mkdir -p database/backups`
2. Create compressed dump:
   - `docker exec -i tmos-postgres pg_dump -U postgres -d tmos -Fc > database/backups/tmos_phase1.dump`
3. Verify artifact:
   - `ls -lh database/backups/tmos_phase1.dump`

## Restore Verification Procedure
1. Restore backup to clean database (`tmos_restore`) using rollback commands above.
2. Start backend against restored DB:
   - `cd backend && PORT=8082 TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos_restore TMOS_DATABASE_REQUIRED=true npm start`
3. Validate app integrity:
   - `POST /api/auth/login` returns 200 and access token.
   - `GET /api/administration/settings` returns 200 with persisted config.
   - `GET /api/providers/state` returns 200 with persisted provider state.

## Persistence Validation Matrix
After login + overview requests, verify persisted rows:
- `docker exec -i tmos-postgres psql -U postgres -d tmos -At -c "select 'users='||count(*) from users; select 'sessions='||count(*) from sessions; select 'config_entries='||count(*) from config_entries; select 'provider_state='||count(*) from provider_state; select 'events='||count(*) from events; select 'audit_logs='||count(*) from audit_logs;"`

Expected:
- `users >= 1`
- `sessions >= 1`
- `config_entries >= 1`
- `provider_state >= 1`
- `events >= 1`
- `audit_logs >= 1`

## Restart Validation
1. Start backend in DB-required mode:
   - `cd backend && TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tmos TMOS_DATABASE_REQUIRED=true npm run dev`
2. Generate writes (login + overview).
3. Restart backend process.
4. Re-run row count query from Persistence Validation Matrix.

Expected:
- All persisted entities remain available after restart.

## Operational Readiness Checks
### Health/Readiness include database status
- `GET /health` -> includes `data.database.status` and pool stats.
- `GET /readyz` -> includes `data.checks.database.status`.
- `GET /api/v1/health` -> includes `data.database.status`.

### Startup refusal with unavailable database
- `cd backend && PORT=8090 TMOS_DATABASE_URL=postgres://postgres:postgres@localhost:5999/tmos TMOS_DATABASE_REQUIRED=true npm start`

Expected:
- Process exits non-zero.

### Graceful outage handling
1. Stop DB: `docker stop tmos-postgres`
2. Call `GET /health`.

Expected:
- HTTP 503
- Error code `DATABASE_UNAVAILABLE`

3. Restart DB and wait healthy.
4. Call `GET /health` again.

Expected:
- HTTP 200 with database status `ok`.

## Performance Validation Commands
### Startup latency
- Start backend on dedicated port and poll `/health` until ready.
- Record `startup_ms`.

### Login latency
- Send 25 login requests and compute avg/min/max/p95 with `awk`.

### Provider-state read/write latency
- Write path: repeated `GET /api/operations/overview`.
- Read path: repeated `GET /api/providers/state`.
- Compute avg/min/max/p95.

### Pooling behavior
- Hit concurrent logins with `xargs -P40`.
- Inspect:
  - `GET /health` database pool (`total`, `idle`, `waiting`)
  - `pg_stat_activity` counts.

## Phase 1 Completion Gate
- PostgreSQL is the sole runtime system of record.
- No implicit runtime memory fallback in production paths.
- Migrations/backup/restore/startup procedures documented and tested.
- Automated tests pass.
- Health/readiness report database availability correctly.
