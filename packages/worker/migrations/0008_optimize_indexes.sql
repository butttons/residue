-- Composite index for repo-scoped queries ordered by committed_at.
-- Eliminates TEMP B-TREE FOR ORDER BY on the most common query pattern:
-- WHERE org = ? AND repo = ? ORDER BY committed_at DESC
-- Helps: getWithSessions, getGraphData, getDailyActivityCounts, getByRepo
CREATE INDEX idx_commits_repo_committed ON commits(org, repo, committed_at DESC);

-- Index for global committed_at ordering.
-- Eliminates full table scan when sorting all commits by time.
-- Helps: getRecentCommits, getDailyActivityCountsGlobal, getContributors(global)
CREATE INDEX idx_commits_committed ON commits(committed_at DESC);

-- Branch-only index for queries that filter by branch without org/repo prefix.
-- The existing idx_commits_branch is (org, repo, branch) which cannot serve branch-only lookups.
-- Helps: sessions.query with branch filter
CREATE INDEX idx_commits_branch_only ON commits(branch);

-- Author index for commits.query with author filter.
CREATE INDEX idx_commits_author ON commits(author);
