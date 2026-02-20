import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";
import type {
	CommitDetailResult,
	CommitFileRow,
	CommitRow,
	CommitShaDetailRow,
	CommitWithSessionRow,
	InsertCommitParams,
	QueryCommitResult,
	QueryCommitsFilter,
	QuerySessionResult,
} from "./_types";

class CommitDataLayer extends BaseDataLayer {
	insert(params: InsertCommitParams): Promise<Result<void, DBError>> {
		const now = Math.floor(Date.now() / 1000);

		return this.run({
			promise: this.db
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
				.run()
				.then(() => undefined),
			source: "dl.commits.insert",
			code: "CREATE_FAILED",
		});
	}

	insertFiles(opts: {
		commitSha: string;
		files: {
			path: string;
			changeType: string;
			linesAdded: number;
			linesDeleted: number;
		}[];
	}): Promise<Result<void, DBError>> {
		return this.run({
			promise: (async () => {
				for (const file of opts.files) {
					await this.db
						.prepare(
							`INSERT INTO commit_files (commit_sha, file_path, change_type, lines_added, lines_deleted)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(commit_sha, file_path) DO NOTHING`,
						)
						.bind(
							opts.commitSha,
							file.path,
							file.changeType,
							file.linesAdded,
							file.linesDeleted,
						)
						.run();
				}
			})(),
			source: "dl.commits.insertFiles",
			code: "CREATE_FAILED",
		});
	}

	getFiles(commitSha: string): Promise<Result<CommitFileRow[], DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT * FROM commit_files WHERE commit_sha = ?")
				.bind(commitSha)
				.all<CommitFileRow>()
				.then((r) => r.results),
			source: "dl.commits.getFiles",
			code: "GET_FAILED",
		});
	}

	getByRepo(opts: {
		org: string;
		repo: string;
		cursor?: number;
		limit?: number;
	}): Promise<Result<CommitRow[], DBError>> {
		const limit = opts.limit ?? 50;
		const cursor = opts.cursor ?? Math.floor(Date.now() / 1000) + 1;

		return this.run({
			promise: this.db
				.prepare(
					`SELECT * FROM commits
         WHERE org = ? AND repo = ? AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`,
				)
				.bind(opts.org, opts.repo, cursor, limit)
				.all<CommitRow>()
				.then((r) => r.results),
			source: "dl.commits.getByRepo",
			code: "GET_FAILED",
		});
	}

	getWithSessions(opts: {
		org: string;
		repo: string;
		cursor?: number;
		limit?: number;
	}): Promise<Result<CommitWithSessionRow[], DBError>> {
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

		return this.run({
			promise: this.db
				.prepare(query)
				.bind(...bindings)
				.all<CommitWithSessionRow>()
				.then((r) => r.results),
			source: "dl.commits.getWithSessions",
			code: "GET_FAILED",
		});
	}

	getBySha(sha: string): Promise<Result<CommitRow[], DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT * FROM commits WHERE commit_sha = ?")
				.bind(sha)
				.all<CommitRow>()
				.then((r) => r.results),
			source: "dl.commits.getBySha",
			code: "GET_FAILED",
		});
	}

	getShaDetail(opts: {
		sha: string;
		org: string;
		repo: string;
	}): Promise<Result<CommitShaDetailRow[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.branch,
                s.id as session_id, s.agent, s.agent_version,
                s.created_at as session_created_at, s.ended_at as session_ended_at
         FROM commits c
         JOIN sessions s ON c.session_id = s.id
         WHERE c.commit_sha = ? AND c.org = ? AND c.repo = ?`,
				)
				.bind(opts.sha, opts.org, opts.repo)
				.all<CommitShaDetailRow>()
				.then((r) => r.results),
			source: "dl.commits.getShaDetail",
			code: "GET_FAILED",
		});
	}

	getGraphData(opts: {
		org: string;
		repo: string;
		cursor?: number;
		limit?: number;
	}): Promise<Result<CommitWithSessionRow[], DBError>> {
		const limit = opts.limit ?? 20;

		if (opts.cursor !== undefined) {
			return this.run({
				promise: this.db
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
					.all<CommitWithSessionRow>()
					.then((r) => r.results),
				source: "dl.commits.getGraphData",
				code: "GET_FAILED",
			});
		}

		return this.run({
			promise: this.db
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
				.all<CommitWithSessionRow>()
				.then((r) => r.results),
			source: "dl.commits.getGraphData",
			code: "GET_FAILED",
		});
	}

	query(
		filter: QueryCommitsFilter,
	): Promise<Result<QueryCommitResult[], DBError>> {
		const conditions: string[] = [];
		const bindings: unknown[] = [];

		if (filter.repo) {
			conditions.push("c.org || '/' || c.repo = ?");
			bindings.push(filter.repo);
		}
		if (filter.branch) {
			conditions.push("c.branch = ?");
			bindings.push(filter.branch);
		}
		if (filter.author) {
			conditions.push("c.author = ?");
			bindings.push(filter.author);
		}
		if (filter.since) {
			conditions.push("c.committed_at >= ?");
			bindings.push(filter.since);
		}
		if (filter.until) {
			conditions.push("c.committed_at <= ?");
			bindings.push(filter.until);
		}

		const where =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const limit = filter.limit ?? 50;
		const offset = filter.offset ?? 0;

		return this.run({
			promise: this.db
				.prepare(
					`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.branch,
                c.org, c.repo, c.session_id
         FROM commits c
         ${where}
         ORDER BY c.committed_at DESC
         LIMIT ? OFFSET ?`,
				)
				.bind(...bindings, limit, offset)
				.all<QueryCommitResult>()
				.then((r) => r.results),
			source: "dl.commits.query",
			code: "GET_FAILED",
		});
	}

	getDetail(sha: string): Promise<Result<CommitDetailResult | null, DBError>> {
		return this.run({
			promise: (async () => {
				const commitRows = await this.db
					.prepare(
						`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.branch,
                c.org, c.repo, c.session_id
         FROM commits c
         WHERE c.commit_sha = ?`,
					)
					.bind(sha)
					.all<QueryCommitResult>();

				if (commitRows.results.length === 0) return null;

				const first = commitRows.results[0];
				const sessionIds = [
					...new Set(commitRows.results.map((r) => r.session_id)),
				];

				const sessions: QuerySessionResult[] = [];
				for (const sid of sessionIds) {
					const s = await this.db
						.prepare(
							`SELECT id, agent, agent_version, created_at, ended_at,
                  data_path, first_message, session_name
           FROM sessions WHERE id = ?`,
						)
						.bind(sid)
						.first<QuerySessionResult>();
					if (s) sessions.push(s);
				}

				const fileResult = await this.db
					.prepare("SELECT * FROM commit_files WHERE commit_sha = ?")
					.bind(sha)
					.all<CommitFileRow>();

				return {
					commit_sha: first.commit_sha,
					message: first.message,
					author: first.author,
					committed_at: first.committed_at,
					branch: first.branch,
					org: first.org,
					repo: first.repo,
					sessions,
					files: fileResult.results,
				};
			})(),
			source: "dl.commits.getDetail",
			code: "GET_FAILED",
		});
	}
}

export { CommitDataLayer };
