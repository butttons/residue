import { BaseDataLayer } from "./_base";
import type { DBError } from "./_error";
import type { Result } from "./_result";
import type { OrgListItem, RepoListItem } from "./_types";

class OrgDataLayer extends BaseDataLayer {
	getList(): Promise<Result<OrgListItem[], DBError>> {
		return this.run({
			promise: this.db
				.prepare(
					`SELECT org, COUNT(DISTINCT repo) as repo_count, MAX(committed_at) as last_activity
         FROM commits
         GROUP BY org
         ORDER BY last_activity DESC`,
				)
				.all<OrgListItem>()
				.then((r) => r.results),
			source: "dl.orgs.getList",
			code: "GET_FAILED",
		});
	}

	getReposByOrg(org: string): Promise<Result<RepoListItem[], DBError>> {
		return this.run({
			promise: this.db
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
				.all<RepoListItem>()
				.then((r) => r.results),
			source: "dl.orgs.getReposByOrg",
			code: "GET_FAILED",
		});
	}
}

export { OrgDataLayer };
