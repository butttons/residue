import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { upsertSession, insertCommit } from "../lib/db";

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
      await upsertSession({
        db: c.env.DB,
        id: session.id,
        agent: session.agent,
        agentVersion: session.agent_version ?? "unknown",
        status: session.status ?? "open",
        r2Key,
      });

      for (const commit of commits) {
        await insertCommit({
          db: c.env.DB,
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

export { sessions };
