import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createPresignedPutUrl } from "../lib/presign";
import type { AppEnv } from "../types";

const commitFileSchema = z.object({
	path: z.string().min(1),
	change_type: z.string().min(1),
	lines_added: z.number().int().default(0),
	lines_deleted: z.number().int().default(0),
});

const commitSchema = z.object({
	sha: z.string().min(1),
	org: z.string().min(1),
	repo: z.string().min(1),
	message: z.string(),
	author: z.string(),
	committed_at: z.number(),
	branch: z.string().optional(),
	files: z.array(commitFileSchema).optional(),
});

const postSessionsSchema = z.object({
	session: z.object({
		id: z.string().min(1),
		agent: z.string().min(1),
		agent_version: z.string().optional(),
		status: z.enum(["open", "ended"]).optional(),
		data_path: z.string().optional(),
		first_message: z.string().optional(),
		session_name: z.string().optional(),
		first_message_at: z.number().int().optional(),
		last_message_at: z.number().int().optional(),
	}),
	commits: z.array(commitSchema),
});

const sessions = new Hono<AppEnv>();

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

		const { DL } = c.var;

		const sessionResult = await DL.sessions.upsert({
			id: session.id,
			agent: session.agent,
			agentVersion: session.agent_version ?? "unknown",
			status: session.status ?? "open",
			r2Key,
			dataPath: session.data_path ?? null,
			firstMessage: session.first_message ?? null,
			sessionName: session.session_name ?? null,
			firstMessageAt: session.first_message_at ?? null,
			lastMessageAt: session.last_message_at ?? null,
		});
		if (sessionResult.isErr) {
			return c.json({ error: "Failed to write metadata to database" }, 500);
		}

		for (const commit of commits) {
			const commitResult = await DL.commits.insert({
				commitSha: commit.sha,
				org: commit.org,
				repo: commit.repo,
				sessionId: session.id,
				message: commit.message,
				author: commit.author,
				committedAt: commit.committed_at,
				branch: commit.branch ?? null,
			});
			if (commitResult.isErr) {
				return c.json({ error: "Failed to write metadata to database" }, 500);
			}

			if (commit.files && commit.files.length > 0) {
				const filesResult = await DL.commits.insertFiles({
					commitSha: commit.sha,
					files: commit.files.map((f) => ({
						path: f.path,
						changeType: f.change_type,
						linesAdded: f.lines_added,
						linesDeleted: f.lines_deleted,
					})),
				});
				if (filesResult.isErr) {
					return c.json({ error: "Failed to write metadata to database" }, 500);
				}
			}
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

sessions.get("/:id/metadata", async (c) => {
	const id = c.req.param("id");
	const result = await c.var.DL.sessions.getById(id);
	if (result.isErr) {
		return c.json({ error: "Failed to fetch session" }, 500);
	}
	const session = result.value;
	if (!session) {
		return c.json({ error: "Session not found" }, 404);
	}
	return c.json(
		{
			session: {
				id: session.id,
				agent: session.agent,
				agent_version: session.agent_version,
				created_at: session.created_at,
				ended_at: session.ended_at,
				data_path: session.data_path,
				first_message: session.first_message,
				session_name: session.session_name,
				first_message_at: session.first_message_at,
				last_message_at: session.last_message_at,
			},
		},
		200,
	);
});

sessions.get("/:id/commits", async (c) => {
	const id = c.req.param("id");
	const result = await c.var.DL.sessions.getCommits(id);
	if (result.isErr) {
		return c.json({ error: "Failed to fetch commits" }, 500);
	}
	return c.json({ commits: result.value }, 200);
});

sessions.get("/:id", async (c) => {
	const id = c.req.param("id");

	const result = await c.var.DL.sessions.getById(id);
	if (result.isErr) {
		return c.json({ error: "Failed to fetch session" }, 500);
	}
	const session = result.value;
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
				data_path: session.data_path,
				first_message: session.first_message,
				session_name: session.session_name,
				first_message_at: session.first_message_at,
				last_message_at: session.last_message_at,
			},
			data,
		},
		200,
	);
});

sessions.delete("/:id/commits/:sha", async (c) => {
	const sessionId = c.req.param("id");
	const commitSha = c.req.param("sha");

	const result = await c.var.DL.commits.unlinkSession({
		commitSha,
		sessionId,
	});
	if (result.isErr) {
		return c.json({ error: "Failed to unlink session from commit" }, 500);
	}
	if (!result.value.isDeleted) {
		return c.json({ error: "Link not found" }, 404);
	}

	return c.json({ ok: true }, 200);
});

const linkCommitSchema = z.object({
	org: z.string().min(1).optional(),
	repo: z.string().min(1).optional(),
	message: z.string().nullable().optional(),
	author: z.string().nullable().optional(),
	committed_at: z.number().nullable().optional(),
	branch: z.string().nullable().optional(),
});

sessions.post(
	"/:id/commits/:sha",
	zValidator("json", linkCommitSchema, (result, c) => {
		if (!result.success) {
			return c.json(
				{ error: "Validation failed", details: result.error.issues },
				400,
			);
		}
	}),
	async (c) => {
		const sessionId = c.req.param("id");
		const commitSha = c.req.param("sha");
		const body = c.req.valid("json");

		// Verify the session exists
		const sessionResult = await c.var.DL.sessions.getById(sessionId);
		if (sessionResult.isErr) {
			return c.json({ error: "Failed to verify session" }, 500);
		}
		if (!sessionResult.value) {
			return c.json({ error: "Session not found" }, 404);
		}

		// If org/repo not provided, try to fill from an existing commit row for this SHA
		let org = body.org ?? null;
		let repo = body.repo ?? null;
		let message = body.message ?? null;
		let author = body.author ?? null;
		let committedAt = body.committed_at ?? null;
		let branch = body.branch ?? null;

		if (!org || !repo) {
			const existingResult = await c.var.DL.commits.getBySha(commitSha);
			if (existingResult.isOk && existingResult.value.length > 0) {
				const existing = existingResult.value[0];
				org = org ?? existing.org;
				repo = repo ?? existing.repo;
				message = message ?? existing.message;
				author = author ?? existing.author;
				committedAt = committedAt ?? existing.committed_at;
				branch = branch ?? existing.branch;
			}
		}

		if (!org || !repo) {
			return c.json(
				{
					error:
						"org and repo are required when linking to a commit that does not yet exist in the database",
				},
				400,
			);
		}

		const result = await c.var.DL.commits.linkSession({
			commitSha,
			sessionId,
			org,
			repo,
			message,
			author,
			committedAt,
			branch,
		});
		if (result.isErr) {
			return c.json({ error: "Failed to link session to commit" }, 500);
		}

		return c.json({ ok: true }, 200);
	},
);

export { sessions };
