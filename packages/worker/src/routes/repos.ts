import { Hono } from "hono";
import type { AppEnv } from "../types";

const repos = new Hono<AppEnv>();

repos.get("/:org/:repo", async (c) => {
	const org = c.req.param("org");
	const repo = c.req.param("repo");
	const cursorParam = c.req.query("cursor");
	const cursor = cursorParam ? Number(cursorParam) : undefined;

	if (cursorParam !== undefined && (isNaN(cursor!) || cursor! < 0)) {
		return c.json({ error: "Invalid cursor" }, 400);
	}

	const limit = 50;

	const result = await c.var.DL.commits.getWithSessions({
		org,
		repo,
		cursor,
		limit,
	});
	if (result.isErr) {
		return c.json({ error: "Failed to fetch commits" }, 500);
	}
	const rows = result.value;

	const commitMap = new Map<
		string,
		{
			sha: string;
			message: string | null;
			author: string | null;
			committed_at: number | null;
			branch: string | null;
			sessions: { id: string; agent: string }[];
		}
	>();

	for (const row of rows) {
		const existing = commitMap.get(row.commit_sha);
		if (existing) {
			const isAlreadyLinked = existing.sessions.some(
				(s) => s.id === row.session_id,
			);
			if (!isAlreadyLinked) {
				existing.sessions.push({ id: row.session_id, agent: row.agent });
			}
		} else {
			commitMap.set(row.commit_sha, {
				sha: row.commit_sha,
				message: row.message,
				author: row.author,
				committed_at: row.committed_at,
				branch: row.branch,
				sessions: [{ id: row.session_id, agent: row.agent }],
			});
		}
	}

	const commits = [...commitMap.values()];

	const lastRow = rows[rows.length - 1];
	const hasMore = rows.length === limit;
	const nextCursor =
		hasMore && lastRow?.committed_at != null
			? String(lastRow.committed_at)
			: null;

	return c.json({ commits, next_cursor: nextCursor }, 200);
});

repos.get("/:org/:repo/:sha", async (c) => {
	const org = c.req.param("org");
	const repo = c.req.param("repo");
	const sha = c.req.param("sha");

	const detailResult = await c.var.DL.commits.getShaDetail({ sha, org, repo });
	if (detailResult.isErr) {
		return c.json({ error: "Failed to fetch commit" }, 500);
	}
	const rows = detailResult.value;

	if (rows.length === 0) {
		return c.json({ error: "Commit not found" }, 404);
	}

	const first = rows[0];
	const sessions = rows.map((row) => ({
		id: row.session_id,
		agent: row.agent,
		agent_version: row.agent_version,
		created_at: row.session_created_at,
		ended_at: row.session_ended_at,
	}));

	const filesResult = await c.var.DL.commits.getFiles(sha);
	if (filesResult.isErr) {
		return c.json({ error: "Failed to fetch commit files" }, 500);
	}

	return c.json(
		{
			commit: {
				sha: first.commit_sha,
				message: first.message,
				author: first.author,
				committed_at: first.committed_at,
				branch: first.branch,
			},
			sessions,
			files: filesResult.value.map((f) => ({
				path: f.file_path,
				change_type: f.change_type,
				lines_added: f.lines_added,
				lines_deleted: f.lines_deleted,
			})),
		},
		200,
	);
});

export { repos };
