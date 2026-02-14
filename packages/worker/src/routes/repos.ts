import { Hono } from "hono";
import { DB } from "../lib/db";

const repos = new Hono<{ Bindings: Env }>();

repos.get("/:org/:repo", async (c) => {
  const org = c.req.param("org");
  const repo = c.req.param("repo");
  const cursorParam = c.req.query("cursor");
  const cursor = cursorParam ? Number(cursorParam) : undefined;

  if (cursorParam !== undefined && (isNaN(cursor!) || cursor! < 0)) {
    return c.json({ error: "Invalid cursor" }, 400);
  }

  const db = new DB(c.env.DB);
  const limit = 50;

  const rows = await db.getCommitsWithSessions({ org, repo, cursor, limit });

  const commitMap = new Map<
    string,
    {
      sha: string;
      message: string | null;
      author: string | null;
      committed_at: number | null;
      sessions: { id: string; agent: string }[];
    }
  >();

  for (const row of rows) {
    const existing = commitMap.get(row.commit_sha);
    if (existing) {
      const isAlreadyLinked = existing.sessions.some((s) => s.id === row.session_id);
      if (!isAlreadyLinked) {
        existing.sessions.push({ id: row.session_id, agent: row.agent });
      }
    } else {
      commitMap.set(row.commit_sha, {
        sha: row.commit_sha,
        message: row.message,
        author: row.author,
        committed_at: row.committed_at,
        sessions: [{ id: row.session_id, agent: row.agent }],
      });
    }
  }

  const commits = [...commitMap.values()];

  const lastRow = rows[rows.length - 1];
  const hasMore = rows.length === limit;
  const nextCursor =
    hasMore && lastRow?.committed_at != null ? String(lastRow.committed_at) : null;

  return c.json({ commits, next_cursor: nextCursor }, 200);
});

export { repos };
