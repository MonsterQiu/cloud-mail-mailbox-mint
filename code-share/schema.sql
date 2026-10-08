-- Authorization metadata only. Apply to SHARE_DB, never the production mail database.
CREATE TABLE IF NOT EXISTS share_grants (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  passcode_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  cutoff_id INTEGER NOT NULL,
  revoked_at INTEGER,
  next_poll_at INTEGER NOT NULL DEFAULT 0,
  query_day TEXT NOT NULL DEFAULT '',
  daily_queries INTEGER NOT NULL DEFAULT 0
);
