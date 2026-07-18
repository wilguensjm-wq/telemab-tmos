CREATE TABLE IF NOT EXISTS reporter_presence (
  reporter_id TEXT PRIMARY KEY REFERENCES reporters(id) ON DELETE CASCADE,
  connection_status TEXT NOT NULL DEFAULT 'Offline',
  last_heartbeat TIMESTAMPTZ,
  login_time TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  current_assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  current_studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL,
  device_type TEXT,
  operating_system TEXT,
  app_version TEXT,
  camera_ready BOOLEAN NOT NULL DEFAULT FALSE,
  microphone_ready BOOLEAN NOT NULL DEFAULT FALSE,
  speaker_ready BOOLEAN NOT NULL DEFAULT FALSE,
  internet_quality TEXT,
  signal_strength INTEGER,
  battery_level INTEGER,
  is_charging BOOLEAN,
  session_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (connection_status IN ('Offline', 'Connecting', 'Online', 'Ready', 'Live', 'Disconnected')),
  CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
  CHECK (signal_strength IS NULL OR (signal_strength >= 0 AND signal_strength <= 100))
);

CREATE INDEX IF NOT EXISTS idx_reporter_presence_status ON reporter_presence(connection_status);
CREATE INDEX IF NOT EXISTS idx_reporter_presence_last_heartbeat ON reporter_presence(last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_reporter_presence_assignment ON reporter_presence(current_assignment_id);
CREATE INDEX IF NOT EXISTS idx_reporter_presence_studio ON reporter_presence(current_studio_id);
CREATE INDEX IF NOT EXISTS idx_reporter_presence_session_id ON reporter_presence(session_id);
