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
	branch: string | null;
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
	branch: string | null;
};

type OrgListItem = {
	org: string;
	repo_count: number;
	last_activity: number | null;
};

type RepoListItem = {
	repo: string;
	session_count: number;
	commit_count: number;
	last_activity: number | null;
};

type SessionCommitRow = {
	commit_sha: string;
	committed_at: number | null;
	org: string;
	repo: string;
	branch: string | null;
};

type CommitWithSessionRow = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	session_id: string;
	agent: string;
	branch: string | null;
};

type CommitShaDetailRow = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	session_id: string;
	agent: string;
	agent_version: string | null;
	session_created_at: number;
	session_ended_at: number | null;
	branch: string | null;
};

type UserRow = {
	id: string;
	username: string;
	password_hash: string;
	created_at: number;
};

type DailySessionCount = {
	date: string;
	count: number;
};

type DailyActivityCount = {
	date: string;
	sessionCount: number;
	commitCount: number;
};

export type {
	SessionRow,
	CommitRow,
	CommitWithSessionRow,
	CommitShaDetailRow,
	OrgListItem,
	RepoListItem,
	SessionCommitRow,
	DailySessionCount,
	DailyActivityCount,
	UserRow,
};

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
           r2_key = excluded.r2_key`,
			)
			.bind(
				params.id,
				params.agent,
				params.agentVersion,
				now,
				endedAt,
				params.r2Key,
			)
			.run();
	}

	async insertCommit(params: InsertCommitParams): Promise<void> {
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO commits (commit_sha, repo, org, session_id, message, author, committed_at, created_at, branch)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(commit_sha, session_id) DO NOTHING`,
			)
			.bind(
				params.commitSha,
				params.repo,
				params.org,
				params.sessionId,
				params.message,
				params.author,
				params.committedAt,
				now,
				params.branch,
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
         LIMIT ?`,
			)
			.bind(opts.org, opts.repo, cursor, limit)
			.all<CommitRow>();

		return result.results;
	}

	async getCommitsWithSessions(opts: {
		org: string;
		repo: string;
		cursor?: number;
		limit?: number;
	}): Promise<CommitWithSessionRow[]> {
		const limit = opts.limit ?? 50;

		let query: string;
		let bindings: unknown[];

		if (opts.cursor !== undefined) {
			query = `SELECT c.commit_sha, c.message, c.author, c.committed_at, c.session_id, s.agent, c.branch
               FROM commits c
               JOIN sessions s ON c.session_id = s.id
               WHERE c.org = ? AND c.repo = ? AND c.committed_at < ?
               ORDER BY c.committed_at DESC
               LIMIT ?`;
			bindings = [opts.org, opts.repo, opts.cursor, limit];
		} else {
			query = `SELECT c.commit_sha, c.message, c.author, c.committed_at, c.session_id, s.agent, c.branch
               FROM commits c
               JOIN sessions s ON c.session_id = s.id
               WHERE c.org = ? AND c.repo = ?
               ORDER BY c.committed_at DESC
               LIMIT ?`;
			bindings = [opts.org, opts.repo, limit];
		}

		const result = await this.db
			.prepare(query)
			.bind(...bindings)
			.all<CommitWithSessionRow>();

		return result.results;
	}

	async getCommitsBySha(sha: string): Promise<CommitRow[]> {
		const result = await this.db
			.prepare("SELECT * FROM commits WHERE commit_sha = ?")
			.bind(sha)
			.all<CommitRow>();

		return result.results;
	}

	async getCommitShaDetail(opts: {
		sha: string;
		org: string;
		repo: string;
	}): Promise<CommitShaDetailRow[]> {
		const result = await this.db
			.prepare(
				`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.branch,
                s.id as session_id, s.agent, s.agent_version,
                s.created_at as session_created_at, s.ended_at as session_ended_at
         FROM commits c
         JOIN sessions s ON c.session_id = s.id
         WHERE c.commit_sha = ? AND c.org = ? AND c.repo = ?`,
			)
			.bind(opts.sha, opts.org, opts.repo)
			.all<CommitShaDetailRow>();

		return result.results;
	}

	async getOrgList(): Promise<OrgListItem[]> {
		const result = await this.db
			.prepare(
				`SELECT org, COUNT(DISTINCT repo) as repo_count, MAX(committed_at) as last_activity
         FROM commits
         GROUP BY org
         ORDER BY last_activity DESC`,
			)
			.all<OrgListItem>();

		return result.results;
	}

	async getReposByOrg(org: string): Promise<RepoListItem[]> {
		const result = await this.db
			.prepare(
				`SELECT repo,
                COUNT(DISTINCT session_id) as session_count,
                COUNT(DISTINCT commit_sha) as commit_count,
                MAX(committed_at) as last_activity
         FROM commits
         WHERE org = ?
         GROUP BY repo
         ORDER BY last_activity DESC`,
			)
			.bind(org)
			.all<RepoListItem>();

		return result.results;
	}

	async getCommitGraphData(opts: {
		org: string;
		repo: string;
		cursor?: number;
		limit?: number;
	}): Promise<CommitWithSessionRow[]> {
		const limit = opts.limit ?? 20;

		if (opts.cursor !== undefined) {
			const result = await this.db
				.prepare(
					`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.session_id, s.agent, c.branch
           FROM commits c
           JOIN sessions s ON c.session_id = s.id
           WHERE c.org = ? AND c.repo = ? AND c.commit_sha IN (
             SELECT commit_sha FROM commits
             WHERE org = ? AND repo = ? AND committed_at < ?
             GROUP BY commit_sha
             ORDER BY MAX(committed_at) DESC
             LIMIT ?
           )
           ORDER BY c.committed_at DESC`,
				)
				.bind(opts.org, opts.repo, opts.org, opts.repo, opts.cursor, limit)
				.all<CommitWithSessionRow>();
			return result.results;
		}

		const result = await this.db
			.prepare(
				`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.session_id, s.agent, c.branch
         FROM commits c
         JOIN sessions s ON c.session_id = s.id
         WHERE c.org = ? AND c.repo = ? AND c.commit_sha IN (
           SELECT commit_sha FROM commits
           WHERE org = ? AND repo = ?
           GROUP BY commit_sha
           ORDER BY MAX(committed_at) DESC
           LIMIT ?
         )
         ORDER BY c.committed_at DESC`,
			)
			.bind(opts.org, opts.repo, opts.org, opts.repo, limit)
			.all<CommitWithSessionRow>();
		return result.results;
	}

	async getSessionCommits(sessionId: string): Promise<SessionCommitRow[]> {
		const result = await this.db
			.prepare(
				`SELECT commit_sha, committed_at, org, repo, branch
         FROM commits
         WHERE session_id = ?
         ORDER BY committed_at ASC`,
			)
			.bind(sessionId)
			.all<SessionCommitRow>();

		return result.results;
	}

	async getDailySessionCounts(opts: {
		org: string;
		repo: string;
		since: number;
	}): Promise<DailySessionCount[]> {
		const result = await this.db
			.prepare(
				`SELECT DATE(s.created_at, 'unixepoch') as date, COUNT(DISTINCT s.id) as count
         FROM sessions s
         JOIN commits c ON c.session_id = s.id
         WHERE c.org = ? AND c.repo = ? AND s.created_at >= ?
         GROUP BY date
         ORDER BY date ASC`,
			)
			.bind(opts.org, opts.repo, opts.since)
			.all<DailySessionCount>();

		return result.results;
	}

	async getDailyActivityCounts(opts: {
		org: string;
		repo: string;
		since: number;
	}): Promise<DailyActivityCount[]> {
		const result = await this.db
			.prepare(
				`SELECT
           DATE(c.committed_at, 'unixepoch') as date,
           COUNT(DISTINCT s.id) as sessionCount,
           COUNT(DISTINCT c.commit_sha) as commitCount
         FROM commits c
         JOIN sessions s ON s.id = c.session_id
         WHERE c.org = ? AND c.repo = ? AND c.committed_at >= ?
         GROUP BY date
         ORDER BY date ASC`,
			)
			.bind(opts.org, opts.repo, opts.since)
			.all<DailyActivityCount>();

		return result.results;
	}

	async getDailyActivityCountsByOrg(opts: {
		org: string;
		since: number;
	}): Promise<DailyActivityCount[]> {
		const result = await this.db
			.prepare(
				`SELECT
           DATE(c.committed_at, 'unixepoch') as date,
           COUNT(DISTINCT s.id) as sessionCount,
           COUNT(DISTINCT c.commit_sha) as commitCount
         FROM commits c
         JOIN sessions s ON s.id = c.session_id
         WHERE c.org = ? AND c.committed_at >= ?
         GROUP BY date
         ORDER BY date ASC`,
			)
			.bind(opts.org, opts.since)
			.all<DailyActivityCount>();

		return result.results;
	}

	async getDailyActivityCountsGlobal(opts: {
		since: number;
	}): Promise<DailyActivityCount[]> {
		const result = await this.db
			.prepare(
				`SELECT
           DATE(c.committed_at, 'unixepoch') as date,
           COUNT(DISTINCT s.id) as sessionCount,
           COUNT(DISTINCT c.commit_sha) as commitCount
         FROM commits c
         JOIN sessions s ON s.id = c.session_id
         WHERE c.committed_at >= ?
         GROUP BY date
         ORDER BY date ASC`,
			)
			.bind(opts.since)
			.all<DailyActivityCount>();

		return result.results;
	}

	// --- User management ---

	async createUser(params: {
		id: string;
		username: string;
		passwordHash: string;
	}): Promise<void> {
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				"INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
			)
			.bind(params.id, params.username, params.passwordHash, now)
			.run();
	}

	async getUserByUsername(username: string): Promise<UserRow | null> {
		return this.db
			.prepare("SELECT * FROM users WHERE username = ?")
			.bind(username)
			.first<UserRow>();
	}

	async listUsers(): Promise<UserRow[]> {
		const result = await this.db
			.prepare("SELECT id, username, created_at FROM users ORDER BY created_at ASC")
			.all<UserRow>();
		return result.results;
	}

	async deleteUser(id: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM users WHERE id = ?")
			.bind(id)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async getUserCount(): Promise<number> {
		const row = await this.db
			.prepare("SELECT COUNT(*) as count FROM users")
			.first<{ count: number }>();
		return row?.count ?? 0;
	}

	// --- Settings ---

	async getSetting(key: string): Promise<string | null> {
		const row = await this.db
			.prepare("SELECT value FROM settings WHERE key = ?")
			.bind(key)
			.first<{ value: string }>();
		return row?.value ?? null;
	}

	async setSetting({ key, value }: { key: string; value: string }): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.bind(key, value)
			.run();
	}

	async getIsPublic(): Promise<boolean> {
		const value = await this.getSetting("is_public");
		return value === "true";
	}
}
