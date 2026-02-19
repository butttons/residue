CREATE TABLE commit_files (
  commit_sha TEXT NOT NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_commit_files_unique ON commit_files(commit_sha, file_path);
CREATE INDEX idx_commit_files_sha ON commit_files(commit_sha);
