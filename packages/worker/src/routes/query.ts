import { Hono } from "hono";
import type { AppEnv } from "../types";

const query = new Hono<AppEnv>();

query.get("/sessions", async (c) => {
	const agent = c.req.query("agent");
	const repo = c.req.query("repo");
	const branch = c.req.query("branch");
	const sinceParam = c.req.query("since");
	const untilParam = c.req.query("until");
	const limitParam = c.req.query("limit");
	const offsetParam = c.req.query("offset");

	const since = sinceParam ? Number(sinceParam) : undefined;
	const until = untilParam ? Number(untilParam) : undefined;
	const limit = limitParam ? Number(limitParam) : undefined;
	const offset = offsetParam ? Number(offsetParam) : undefined;

	if (sinceParam && isNaN(since!)) {
		return c.json({ error: "Invalid 'since' parameter" }, 400);
	}
	if (untilParam && isNaN(until!)) {
		return c.json({ error: "Invalid 'until' parameter" }, 400);
	}

	const result = await c.var.DL.sessions.query({
		agent,
		repo,
		branch,
		since,
		until,
		limit,
		offset,
	});
	if (result.isErr) {
		return c.json({ error: "Failed to query sessions" }, 500);
	}

	return c.json({ sessions: result.value }, 200);
});

query.get("/commits", async (c) => {
	const repo = c.req.query("repo");
	const branch = c.req.query("branch");
	const author = c.req.query("author");
	const sinceParam = c.req.query("since");
	const untilParam = c.req.query("until");
	const limitParam = c.req.query("limit");
	const offsetParam = c.req.query("offset");

	const since = sinceParam ? Number(sinceParam) : undefined;
	const until = untilParam ? Number(untilParam) : undefined;
	const limit = limitParam ? Number(limitParam) : undefined;
	const offset = offsetParam ? Number(offsetParam) : undefined;

	if (sinceParam && isNaN(since!)) {
		return c.json({ error: "Invalid 'since' parameter" }, 400);
	}
	if (untilParam && isNaN(until!)) {
		return c.json({ error: "Invalid 'until' parameter" }, 400);
	}

	const result = await c.var.DL.commits.query({
		repo,
		branch,
		author,
		since,
		until,
		limit,
		offset,
	});
	if (result.isErr) {
		return c.json({ error: "Failed to query commits" }, 500);
	}

	const commits = result.value;

	// Group by commit SHA
	const commitMap = new Map<
		string,
		{
			sha: string;
			message: string | null;
			author: string | null;
			committed_at: number | null;
			branch: string | null;
			org: string;
			repo: string;
			session_ids: string[];
		}
	>();

	for (const row of commits) {
		const existing = commitMap.get(row.commit_sha);
		if (existing) {
			if (!existing.session_ids.includes(row.session_id)) {
				existing.session_ids.push(row.session_id);
			}
		} else {
			commitMap.set(row.commit_sha, {
				sha: row.commit_sha,
				message: row.message,
				author: row.author,
				committed_at: row.committed_at,
				branch: row.branch,
				org: row.org,
				repo: row.repo,
				session_ids: [row.session_id],
			});
		}
	}

	return c.json({ commits: [...commitMap.values()] }, 200);
});

query.get("/sessions/:id", async (c) => {
	const id = c.req.param("id");

	const result = await c.var.DL.sessions.getDetail(id);
	if (result.isErr) {
		return c.json({ error: "Failed to fetch session" }, 500);
	}
	if (!result.value) {
		return c.json({ error: "Session not found" }, 404);
	}

	return c.json(result.value, 200);
});

query.get("/commits/:sha", async (c) => {
	const sha = c.req.param("sha");

	const result = await c.var.DL.commits.getDetail(sha);
	if (result.isErr) {
		return c.json({ error: "Failed to fetch commit" }, 500);
	}
	if (!result.value) {
		return c.json({ error: "Commit not found" }, 404);
	}

	return c.json(result.value, 200);
});

export { query };
