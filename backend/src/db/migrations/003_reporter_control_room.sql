CREATE TABLE IF NOT EXISTS reporters (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reporters_status ON reporters(status);
CREATE INDEX IF NOT EXISTS idx_reporters_full_name ON reporters(full_name);

CREATE TABLE IF NOT EXISTS studios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studios_status ON studios(status);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES reporters(id) ON DELETE RESTRICT,
  studio_id TEXT NOT NULL REFERENCES studios(id) ON DELETE RESTRICT,
  assignment_status TEXT NOT NULL DEFAULT 'scheduled',
  priority TEXT NOT NULL DEFAULT 'normal',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(assignment_status);
CREATE INDEX IF NOT EXISTS idx_assignments_reporter_id ON assignments(reporter_id);
CREATE INDEX IF NOT EXISTS idx_assignments_studio_id ON assignments(studio_id);
CREATE INDEX IF NOT EXISTS idx_assignments_start ON assignments(scheduled_start DESC);
