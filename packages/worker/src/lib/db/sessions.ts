import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";
import type {
	QuerySessionResult,
	QuerySessionsFilter,
	SessionCommitRow,
	SessionDetailResult,
	SessionRow,
	UpsertSessionParams,
} from "./_types";

class SessionDataLayer extends BaseDataLayer {
	upsert(params: UpsertSessionParams): Promise<Result<void, DBError>> {
		const now = Math.floor(Date.now() / 1000);
		const endedAt = params.status === "ended" ? now : null;

		return this.run({
			promise: this.db
				.prepare(
					`INSERT INTO sessions (id, agent, agent_version, created_at, ended_at, r2_key, data_path, first_message, session_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
           r2_key = excluded.r2_key,
           data_path = COALESCE(excluded.data_path, sessions.data_path),
           first_message = COALESCE(excluded.first_message, sessions.first_message),
           session_name = COALESCE(excluded.session_name, sessions.session_name)`,
				)
				.bind(
					params.id,
					params.agent,
					params.agentVersion,
					now,
					endedAt,
					params.r2Key,
					params.dataPath ?? null,
					params.firstMessage ?? null,
					params.sessionName ?? null,
				)
				.run()
				.then(() => undefined),
			source: "dl.sessions.upsert",
			code: "CREATE_FAILED",
		});
	}

	getById(id: string): Promise<Result<SessionRow | null, DBError>> {
		return this.run({
			promise: this.db
				.prepare("SELECT * FROM sessions WHERE id = ?")
				.bind(id)
				.first<SessionRow>(),
			source: "dl.sessions.getById",
			code: "GET_FAILED",
		});
	}

	getCommits(sessionId: string): Promise<Result<SessionCommitRow[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT commit_sha, committed_at, org, repo, branch
         FROM commits
         WHERE session_id = ?
         ORDER BY committed_at ASC`,
				)
				.bind(sessionId)
				.all<SessionCommitRow>()
				.then((r) => r.results),
			source: "dl.sessions.getCommits",
			code: "GET_FAILED",
		});
	}

	query(
		filter: QuerySessionsFilter,
	): Promise<Result<QuerySessionResult[], DBError>> {
		const conditions: string[] = [];
		const bindings: unknown[] = [];

		if (filter.agent) {
			conditions.push("s.agent = ?");
			bindings.push(filter.agent);
		}
		if (filter.repo) {
			conditions.push(
				"s.id IN (SELECT DISTINCT session_id FROM commits WHERE org || '/' || repo = ?)",
			);
			bindings.push(filter.repo);
		}
		if (filter.branch) {
			conditions.push(
				"s.id IN (SELECT DISTINCT session_id FROM commits WHERE branch = ?)",
			);
			bindings.push(filter.branch);
		}
		if (filter.since) {
			conditions.push("s.created_at >= ?");
			bindings.push(filter.since);
		}
		if (filter.until) {
			conditions.push("s.created_at <= ?");
			bindings.push(filter.until);
		}

		const where =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const limit = filter.limit ?? 50;
		const offset = filter.offset ?? 0;

		return this.run({
			promise: this.db
				.prepare(
					`SELECT s.id, s.agent, s.agent_version, s.created_at, s.ended_at,
                s.data_path, s.first_message, s.session_name
         FROM sessions s
         ${where}
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
				)
				.bind(...bindings, limit, offset)
				.all<QuerySessionResult>()
				.then((r) => r.results),
			source: "dl.sessions.query",
			code: "GET_FAILED",
		});
	}

	getDetail(id: string): Promise<Result<SessionDetailResult | null, DBError>> {
		return this.run({
			promise: (async () => {
				const session = await this.db
					.prepare(
						`SELECT id, agent, agent_version, created_at, ended_at,
                data_path, first_message, session_name
         FROM sessions WHERE id = ?`,
					)
					.bind(id)
					.first<QuerySessionResult>();

				if (!session) return null;

				const commits = await this.db
					.prepare(
						`SELECT commit_sha, message, author, committed_at, branch, org, repo
         FROM commits WHERE session_id = ?
         ORDER BY committed_at ASC`,
					)
					.bind(id)
					.all<{
						commit_sha: string;
						message: string | null;
						author: string | null;
						committed_at: number | null;
						branch: string | null;
						org: string;
						repo: string;
					}>();

				return { session, commits: commits.results };
			})(),
			source: "dl.sessions.getDetail",
			code: "GET_FAILED",
		});
	}
}

export { SessionDataLayer };
