import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";
import type {
	AgentBreakdown,
	ContributorRow,
	ContributorScope,
	DailyActivityCount,
	DailySessionCount,
	GlobalStats,
	RecentCommitRow,
} from "./_types";

class StatsDataLayer extends BaseDataLayer {
	getDailySessionCounts(opts: {
		org: string;
		repo: string;
		since: number;
	}): Promise<Result<DailySessionCount[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT DATE(s.created_at, 'unixepoch') as date, COUNT(DISTINCT s.id) as count
         FROM sessions s
         JOIN commits c ON c.session_id = s.id
         WHERE c.org = ? AND c.repo = ? AND s.created_at >= ?
         GROUP BY date
         ORDER BY date ASC`,
				)
				.bind(opts.org, opts.repo, opts.since)
				.all<DailySessionCount>()
				.then((r) => r.results),
			source: "dl.stats.getDailySessionCounts",
			code: "GET_FAILED",
		});
	}

	getDailyActivityCounts(opts: {
		org: string;
		repo: string;
		since: number;
	}): Promise<Result<DailyActivityCount[], DBError>> {
		return this.run({
			promise: this.db
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
				.all<DailyActivityCount>()
				.then((r) => r.results),
			source: "dl.stats.getDailyActivityCounts",
			code: "GET_FAILED",
		});
	}

	getDailyActivityCountsByOrg(opts: {
		org: string;
		since: number;
	}): Promise<Result<DailyActivityCount[], DBError>> {
		return this.run({
			promise: this.db
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
				.all<DailyActivityCount>()
				.then((r) => r.results),
			source: "dl.stats.getDailyActivityCountsByOrg",
			code: "GET_FAILED",
		});
	}

	getDailyActivityCountsGlobal(opts: {
		since: number;
	}): Promise<Result<DailyActivityCount[], DBError>> {
		return this.run({
			promise: this.db
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
				.all<DailyActivityCount>()
				.then((r) => r.results),
			source: "dl.stats.getDailyActivityCountsGlobal",
			code: "GET_FAILED",
		});
	}

	getGlobalStats(): Promise<Result<GlobalStats, DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT
           (SELECT COUNT(*) FROM sessions) as totalSessions,
           (SELECT COUNT(DISTINCT commit_sha) FROM commits) as totalCommits,
           (SELECT COUNT(DISTINCT org || '/' || repo) FROM commits) as totalRepos,
           (SELECT COUNT(DISTINCT commit_sha || '/' || file_path) FROM commit_files) as totalFilesChanged,
           (SELECT COALESCE(SUM(lines_added), 0) FROM commit_files) as totalLinesAdded,
           (SELECT COALESCE(SUM(lines_deleted), 0) FROM commit_files) as totalLinesDeleted`,
				)
				.first<GlobalStats>()
				.then(
					(result) =>
						result ?? {
							totalSessions: 0,
							totalCommits: 0,
							totalRepos: 0,
							totalFilesChanged: 0,
							totalLinesAdded: 0,
							totalLinesDeleted: 0,
						},
				),
			source: "dl.stats.getGlobalStats",
			code: "GET_FAILED",
		});
	}

	getAgentBreakdown(): Promise<Result<AgentBreakdown[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT agent, COUNT(*) as sessionCount
         FROM sessions
         GROUP BY agent
         ORDER BY sessionCount DESC`,
				)
				.all<AgentBreakdown>()
				.then((r) => r.results),
			source: "dl.stats.getAgentBreakdown",
			code: "GET_FAILED",
		});
	}

	getRecentCommits(opts: {
		limit?: number;
	}): Promise<Result<RecentCommitRow[], DBError>> {
		const limit = opts.limit ?? 10;

		return this.run({
			promise: this.db
				.prepare(
					`SELECT c.commit_sha, c.message, c.author, c.committed_at, c.branch,
                c.org, c.repo, c.session_id, s.agent
         FROM commits c
         JOIN sessions s ON c.session_id = s.id
         ORDER BY c.committed_at DESC
         LIMIT ?`,
				)
				.bind(limit)
				.all<RecentCommitRow>()
				.then((r) => r.results),
			source: "dl.stats.getRecentCommits",
			code: "GET_FAILED",
		});
	}

	getContributors(
		opts: ContributorScope,
	): Promise<Result<ContributorRow[], DBError>> {
		let where = "";
		const bindings: string[] = [];

		if (opts.scope === "org") {
			where = "WHERE c.org = ?";
			bindings.push(opts.org);
		} else if (opts.scope === "repo") {
			where = "WHERE c.org = ? AND c.repo = ?";
			bindings.push(opts.org, opts.repo);
		}

		return this.run({
			promise: this.db
				.prepare(
					`SELECT
           c.author,
           COUNT(DISTINCT c.commit_sha) as commitCount,
           COUNT(DISTINCT c.session_id) as sessionCount,
           MAX(c.committed_at) as lastActive
         FROM commits c
         ${where}
         GROUP BY c.author
         ORDER BY commitCount DESC`,
				)
				.bind(...bindings)
				.all<ContributorRow>()
				.then((r) => r.results),
			source: "dl.stats.getContributors",
			code: "GET_FAILED",
		});
	}
}

export { StatsDataLayer };
