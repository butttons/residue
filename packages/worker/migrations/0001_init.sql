CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  agent_version TEXT,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  r2_key TEXT NOT NULL
);

CREATE TABLE commits (
  commit_sha TEXT NOT NULL,
  repo TEXT NOT NULL,
  org TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message TEXT,
  author TEXT,
  committed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE UNIQUE INDEX idx_commits_unique ON commits(commit_sha, session_id);
CREATE INDEX idx_commits_repo ON commits(org, repo);
CREATE INDEX idx_commits_sha ON commits(commit_sha);
CREATE INDEX idx_commits_session ON commits(session_id);
