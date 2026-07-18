CREATE TABLE IF NOT EXISTS media_rooms (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  provider_room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'control-room',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_key, provider_room_id)
);

CREATE INDEX IF NOT EXISTS idx_media_rooms_provider ON media_rooms(provider_key);
CREATE INDEX IF NOT EXISTS idx_media_rooms_status ON media_rooms(status);

CREATE TABLE IF NOT EXISTS media_participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES media_rooms(id) ON DELETE CASCADE,
  provider_participant_id TEXT NOT NULL,
  user_id TEXT,
  username TEXT NOT NULL,
  reporter_id TEXT REFERENCES reporters(id) ON DELETE SET NULL,
  participant_role TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'connected',
  publisher_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  subscriber_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  device_selection JSONB NOT NULL DEFAULT '{}'::JSONB,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, provider_participant_id)
);

CREATE INDEX IF NOT EXISTS idx_media_participants_room ON media_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_media_participants_reporter ON media_participants(reporter_id);
CREATE INDEX IF NOT EXISTS idx_media_participants_status ON media_participants(connection_status);
