-- OpenTwins initial schema

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_url TEXT,
  target_author TEXT,
  style TEXT,
  content TEXT,
  word_count INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS today_summaries (
  platform TEXT NOT NULL,
  date TEXT NOT NULL,
  comments INTEGER DEFAULT 0,
  styles TEXT DEFAULT '{}',
  disagreements INTEGER DEFAULT 0,
  questions INTEGER DEFAULT 0,
  avg_words INTEGER DEFAULT 0,
  last_style TEXT DEFAULT 'none',
  last_snippet TEXT DEFAULT '',
  PRIMARY KEY (platform, date)
);

CREATE TABLE IF NOT EXISTS engagement_tracking (
  platform TEXT NOT NULL,
  tracking_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(platform, tracking_type, target_id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  actions_summary TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_platform_date ON activity_logs(platform, created_at);
CREATE INDEX IF NOT EXISTS idx_engagement_tracking_lookup ON engagement_tracking(platform, tracking_type, target_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_name_date ON agent_runs(agent_name, started_at);
