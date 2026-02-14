ALTER TABLE commits ADD COLUMN branch TEXT;
CREATE INDEX idx_commits_branch ON commits(org, repo, branch);
