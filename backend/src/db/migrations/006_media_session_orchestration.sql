CREATE TABLE IF NOT EXISTS media_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES media_rooms(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL,
  producer_user_id TEXT,
  producer_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_sessions_room ON media_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_media_sessions_status ON media_sessions(status);
CREATE INDEX IF NOT EXISTS idx_media_sessions_producer ON media_sessions(producer_user_id);

ALTER TABLE media_participants
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES media_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS is_producer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invited_by TEXT,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demoted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_media_participants_session ON media_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_media_participants_lifecycle ON media_participants(lifecycle_state);

CREATE TABLE IF NOT EXISTS media_participant_state_transitions (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES media_participants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES media_sessions(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_media_participant_transitions_participant ON media_participant_state_transitions(participant_id);
CREATE INDEX IF NOT EXISTS idx_media_participant_transitions_session ON media_participant_state_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_media_participant_transitions_created ON media_participant_state_transitions(created_at DESC);
