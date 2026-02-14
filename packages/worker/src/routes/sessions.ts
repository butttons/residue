import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { DB } from "../lib/db";

const commitSchema = z.object({
  sha: z.string().min(1),
  org: z.string().min(1),
  repo: z.string().min(1),
  message: z.string(),
  author: z.string(),
  committed_at: z.number(),
});

const postSessionsSchema = z.object({
  session: z.object({
    id: z.string().min(1),
    agent: z.string().min(1),
    agent_version: z.string().optional(),
    status: z.enum(["open", "ended"]).optional(),
    data: z.string().min(1),
  }),
  commits: z.array(commitSchema),
});

const sessions = new Hono<{ Bindings: Env }>();

sessions.post(
  "/",
  zValidator("json", postSessionsSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "Validation failed", details: result.error.flatten().fieldErrors },
        400
      );
    }
  }),
  async (c) => {
    const { session, commits } = c.req.valid("json");
    const r2Key = `sessions/${session.id}.json`;

    try {
      await c.env.BUCKET.put(r2Key, session.data);
    } catch {
      return c.json({ error: "Failed to write session data to storage" }, 500);
    }

    try {
      const db = new DB(c.env.DB);

      await db.upsertSession({
        id: session.id,
        agent: session.agent,
        agentVersion: session.agent_version ?? "unknown",
        status: session.status ?? "open",
        r2Key,
      });

      for (const commit of commits) {
        await db.insertCommit({
          commitSha: commit.sha,
          org: commit.org,
          repo: commit.repo,
          sessionId: session.id,
          message: commit.message,
          author: commit.author,
          committedAt: commit.committed_at,
        });
      }
    } catch {
      return c.json({ error: "Failed to write metadata to database" }, 500);
    }

    return c.json({ ok: true }, 200);
  }
);

sessions.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = new DB(c.env.DB);

  const session = await db.getSessionById(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const r2Object = await c.env.BUCKET.get(session.r2_key);
  if (!r2Object) {
    return c.json({ error: "Session not found" }, 404);
  }

  const data = await r2Object.text();

  return c.json(
    {
      session: {
        id: session.id,
        agent: session.agent,
        agent_version: session.agent_version,
        created_at: session.created_at,
        ended_at: session.ended_at,
      },
      data,
    },
    200
  );
});

export { sessions };
