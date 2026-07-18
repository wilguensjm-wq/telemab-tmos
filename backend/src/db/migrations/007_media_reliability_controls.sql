ALTER TABLE media_sessions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE media_participants
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS media_session_readiness (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES media_sessions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES media_participants(id) ON DELETE CASCADE,
  camera_ready BOOLEAN NOT NULL DEFAULT FALSE,
  microphone_ready BOOLEAN NOT NULL DEFAULT FALSE,
  speaker_ready BOOLEAN NOT NULL DEFAULT FALSE,
  network_quality TEXT NOT NULL DEFAULT 'fair',
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_media_session_readiness_session ON media_session_readiness(session_id);
CREATE INDEX IF NOT EXISTS idx_media_session_readiness_participant ON media_session_readiness(participant_id);

CREATE TABLE IF NOT EXISTS media_operation_keys (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_hash TEXT,
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_operation_keys_expires ON media_operation_keys(expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_sessions_status'
  ) THEN
    ALTER TABLE media_sessions
      ADD CONSTRAINT chk_media_sessions_status
      CHECK (status IN ('active', 'paused', 'live', 'closed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_sessions_time_order'
  ) THEN
    ALTER TABLE media_sessions
      ADD CONSTRAINT chk_media_sessions_time_order
      CHECK (ended_at IS NULL OR ended_at >= started_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_participants_lifecycle_state'
  ) THEN
    ALTER TABLE media_participants
      ADD CONSTRAINT chk_media_participants_lifecycle_state
      CHECK (lifecycle_state IN ('offline', 'authenticated', 'connected', 'joined', 'ready', 'live', 'muted', 'disconnected'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_session_active_producer
  ON media_participants(session_id)
  WHERE is_producer = TRUE AND lifecycle_state <> 'disconnected';
