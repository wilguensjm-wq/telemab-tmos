-- Reporters table
CREATE TABLE IF NOT EXISTS reporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'offline' CHECK (status IN ('available', 'live', 'busy', 'offline')),
  last_heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reporters_user_id ON reporters(user_id);
CREATE INDEX IF NOT EXISTS idx_reporters_status ON reporters(status);
CREATE INDEX IF NOT EXISTS idx_reporters_last_heartbeat_at ON reporters(last_heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_reporters_connected_at ON reporters(connected_at);

-- Reporter sessions
CREATE TABLE IF NOT EXISTS reporter_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  user_agent VARCHAR(1024),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  heartbeat_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reporter_sessions_reporter_id ON reporter_sessions(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reporter_sessions_session_id ON reporter_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_reporter_sessions_started_at ON reporter_sessions(started_at);

-- Reporter status history (immutable audit trail)
CREATE TABLE IF NOT EXISTS reporter_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
  session_id UUID REFERENCES reporter_sessions(id) ON DELETE SET NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reporter_status_history_reporter_id ON reporter_status_history(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reporter_status_history_created_at ON reporter_status_history(created_at);

-- Reporter activity log (for analytics)
CREATE TABLE IF NOT EXISTS reporter_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES reporters(id) ON DELETE CASCADE,
  session_id UUID REFERENCES reporter_sessions(id) ON DELETE SET NULL,
  activity_type VARCHAR(100) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reporter_activity_reporter_id ON reporter_activity(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reporter_activity_activity_type ON reporter_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_reporter_activity_created_at ON reporter_activity(created_at);
