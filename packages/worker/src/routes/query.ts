import { Hono } from "hono";
import { DB } from "../lib/db";

const query = new Hono<{ Bindings: Env }>();

query.get("/sessions", async (c) => {
	const db = new DB(c.env.DB);

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

	const sessions = await db.querySessions({
		agent,
		repo,
		branch,
		since,
		until,
		limit,
		offset,
	});

	return c.json({ sessions }, 200);
});

query.get("/commits", async (c) => {
	const db = new DB(c.env.DB);

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

	const commits = await db.queryCommits({
		repo,
		branch,
		author,
		since,
		until,
		limit,
		offset,
	});

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
	const db = new DB(c.env.DB);

	const detail = await db.getSessionDetail(id);
	if (!detail) {
		return c.json({ error: "Session not found" }, 404);
	}

	return c.json(detail, 200);
});

query.get("/commits/:sha", async (c) => {
	const sha = c.req.param("sha");
	const db = new DB(c.env.DB);

	const detail = await db.getCommitDetail(sha);
	if (!detail) {
		return c.json({ error: "Commit not found" }, 404);
	}

	return c.json(detail, 200);
});

export { query };
