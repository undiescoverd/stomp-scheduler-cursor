CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  week TEXT NOT NULL,
  shows_data JSONB NOT NULL,
  assignments_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_created_at ON schedules(created_at DESC);
