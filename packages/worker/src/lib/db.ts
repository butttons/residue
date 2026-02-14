type UpsertSessionParams = {
  id: string;
  agent: string;
  agentVersion: string;
  status: string;
  r2Key: string;
};

type InsertCommitParams = {
  commitSha: string;
  repo: string;
  org: string;
  sessionId: string;
  message: string;
  author: string;
  committedAt: number;
};

type SessionRow = {
  id: string;
  agent: string;
  agent_version: string | null;
  created_at: number;
  ended_at: number | null;
  r2_key: string;
};

type CommitRow = {
  commit_sha: string;
  repo: string;
  org: string;
  session_id: string;
  message: string | null;
  author: string | null;
  committed_at: number | null;
  created_at: number;
};

type OrgListItem = {
  org: string;
  repo_count: number;
};

type RepoListItem = {
  repo: string;
  session_count: number;
  last_activity: number;
};

export type { SessionRow, CommitRow, OrgListItem, RepoListItem };

export class DB {
  constructor(private db: D1Database) {}

  async upsertSession(params: UpsertSessionParams): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const endedAt = params.status === "ended" ? now : null;

    await this.db
      .prepare(
        `INSERT INTO sessions (id, agent, agent_version, created_at, ended_at, r2_key)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
           r2_key = excluded.r2_key`
      )
      .bind(params.id, params.agent, params.agentVersion, now, endedAt, params.r2Key)
      .run();
  }

  async insertCommit(params: InsertCommitParams): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await this.db
      .prepare(
        `INSERT INTO commits (commit_sha, repo, org, session_id, message, author, committed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(commit_sha, session_id) DO NOTHING`
      )
      .bind(
        params.commitSha,
        params.repo,
        params.org,
        params.sessionId,
        params.message,
        params.author,
        params.committedAt,
        now
      )
      .run();
  }

  async getSessionById(id: string): Promise<SessionRow | null> {
    return this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .bind(id)
      .first<SessionRow>();
  }

  async getCommitsByRepo(opts: {
    org: string;
    repo: string;
    cursor?: number;
    limit?: number;
  }): Promise<CommitRow[]> {
    const limit = opts.limit ?? 50;
    const cursor = opts.cursor ?? Math.floor(Date.now() / 1000) + 1;

    const result = await this.db
      .prepare(
        `SELECT * FROM commits
         WHERE org = ? AND repo = ? AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(opts.org, opts.repo, cursor, limit)
      .all<CommitRow>();

    return result.results;
  }

  async getCommitsBySha(sha: string): Promise<CommitRow[]> {
    const result = await this.db
      .prepare("SELECT * FROM commits WHERE commit_sha = ?")
      .bind(sha)
      .all<CommitRow>();

    return result.results;
  }

  async getOrgList(): Promise<OrgListItem[]> {
    const result = await this.db
      .prepare(
        `SELECT org, COUNT(DISTINCT repo) as repo_count
         FROM commits
         GROUP BY org
         ORDER BY org`
      )
      .all<OrgListItem>();

    return result.results;
  }

  async getReposByOrg(org: string): Promise<RepoListItem[]> {
    const result = await this.db
      .prepare(
        `SELECT repo,
                COUNT(DISTINCT session_id) as session_count,
                MAX(created_at) as last_activity
         FROM commits
         WHERE org = ?
         GROUP BY repo
         ORDER BY last_activity DESC`
      )
      .bind(org)
      .all<RepoListItem>();

    return result.results;
  }
}
