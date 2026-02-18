import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { DB } from "../lib/db";
import { createPresignedPutUrl } from "../lib/presign";

const commitSchema = z.object({
	sha: z.string().min(1),
	org: z.string().min(1),
	repo: z.string().min(1),
	message: z.string(),
	author: z.string(),
	committed_at: z.number(),
	branch: z.string().optional(),
});

const postSessionsSchema = z.object({
	session: z.object({
		id: z.string().min(1),
		agent: z.string().min(1),
		agent_version: z.string().optional(),
		status: z.enum(["open", "ended"]).optional(),
	}),
	commits: z.array(commitSchema),
});

const sessions = new Hono<{ Bindings: Env }>();

sessions.post(
	"/",
	zValidator("json", postSessionsSchema, (result, c) => {
		if (!result.success) {
			return c.json(
				{ error: "Validation failed", details: result.error.issues },
				400,
			);
		}
	}),
	async (c) => {
		const { session, commits } = c.req.valid("json");
		const r2Key = `sessions/${session.id}.json`;

		// Session data is uploaded directly to R2 via presigned URL before
		// this metadata-only POST is called. No inline R2 write needed.

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
					branch: commit.branch ?? null,
				});
			}
		} catch {
			return c.json({ error: "Failed to write metadata to database" }, 500);
		}

		return c.json({ ok: true }, 200);
	},
);

const uploadUrlSchema = z.object({
	session_id: z.string().min(1),
});

sessions.post(
	"/upload-url",
	zValidator("json", uploadUrlSchema, (result, c) => {
		if (!result.success) {
			return c.json(
				{ error: "Validation failed", details: result.error.issues },
				400,
			);
		}
	}),
	async (c) => {
		const { session_id } = c.req.valid("json");

		const {
			R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY,
			R2_ACCOUNT_ID,
			R2_BUCKET_NAME,
		} = c.env;

		if (
			!R2_ACCESS_KEY_ID ||
			!R2_SECRET_ACCESS_KEY ||
			!R2_ACCOUNT_ID ||
			!R2_BUCKET_NAME
		) {
			return c.json(
				{
					error:
						"R2 S3 API credentials not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, and R2_BUCKET_NAME.",
				},
				500,
			);
		}

		const r2Key = `sessions/${session_id}.json`;
		const searchR2Key = `search/${session_id}.txt`;

		const presignOpts = {
			accountId: R2_ACCOUNT_ID,
			accessKeyId: R2_ACCESS_KEY_ID,
			secretAccessKey: R2_SECRET_ACCESS_KEY,
			bucketName: R2_BUCKET_NAME,
			expiresIn: 3600,
		};

		const [url, searchUrl] = await Promise.all([
			createPresignedPutUrl({ ...presignOpts, key: r2Key }),
			createPresignedPutUrl({ ...presignOpts, key: searchR2Key }),
		]);

		return c.json(
			{ url, r2_key: r2Key, search_url: searchUrl, search_r2_key: searchR2Key },
			200,
		);
	},
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
		200,
	);
});

export { sessions };
