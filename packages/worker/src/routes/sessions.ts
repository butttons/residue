import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { DB } from "../lib/db";

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
		data: z.string().optional(),
	}),
	commits: z.array(commitSchema),
});

const uploadUrlSchema = z.object({
	session_id: z.string().min(1),
});

const sessions = new Hono<{ Bindings: Env }>();

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
		const r2Key = `sessions/${session_id}.json`;

		const s3 = new S3Client({
			region: "auto",
			endpoint: `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: c.env.R2_ACCESS_KEY_ID,
				secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
			},
		});

		const command = new PutObjectCommand({
			Bucket: c.env.R2_BUCKET_NAME,
			Key: r2Key,
			ContentType: "application/json",
		});

		const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

		return c.json({ url }, 200);
	},
);

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

		// Write raw session data to R2 if provided inline
		if (session.data) {
			await c.env.BUCKET.put(r2Key, session.data, {
				httpMetadata: { contentType: "application/json" },
			});
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
					branch: commit.branch ?? null,
				});
			}
		} catch {
			return c.json({ error: "Failed to write metadata to database" }, 500);
		}

		return c.json({ ok: true }, 200);
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
