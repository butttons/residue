import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };

function makeBody(overrides?: Record<string, unknown>) {
	return {
		session: {
			id: "test-session-1",
			agent: "claude-code",
			agent_version: "1.2.3",
			status: "ended",
		},
		commits: [
			{
				sha: "abc123",
				org: "my-org",
				repo: "my-repo",
				message: "fix auth redirect",
				author: "jane",
				committed_at: 1700000000,
				branch: "main",
			},
		],
		...overrides,
	};
}

async function postSession(body: unknown) {
	return SELF.fetch("https://test.local/api/sessions", {
		method: "POST",
		headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const db = new DB(env.DB);

describe("POST /api/sessions", () => {
	it("stores session metadata in D1", async () => {
		const res = await postSession(makeBody());

		expect(res.status).toBe(200);
		const body = await res.json<{ ok: boolean }>();
		expect(body.ok).toBe(true);

		// Verify D1 session
		const session = await db.getSessionById("test-session-1");
		expect(session).not.toBeNull();
		expect(session!.agent).toBe("claude-code");
		expect(session!.agent_version).toBe("1.2.3");
		expect(session!.ended_at).not.toBeNull();
		expect(session!.r2_key).toBe("sessions/test-session-1.json");

		// Verify D1 commits
		const commits = await db.getCommitsBySha("abc123");
		expect(commits).toHaveLength(1);
		expect(commits[0].org).toBe("my-org");
		expect(commits[0].repo).toBe("my-repo");
		expect(commits[0].message).toBe("fix auth redirect");
		expect(commits[0].author).toBe("jane");
		expect(commits[0].committed_at).toBe(1700000000);
	});

	it("stores branch in commits table", async () => {
		const res = await postSession(makeBody());
		expect(res.status).toBe(200);

		const commits = await db.getCommitsBySha("abc123");
		expect(commits).toHaveLength(1);
		expect(commits[0].branch).toBe("main");
	});

	it("accepts commits without branch field", async () => {
		const payload = makeBody({
			commits: [
				{
					sha: "no-branch-sha",
					org: "my-org",
					repo: "my-repo",
					message: "no branch",
					author: "jane",
					committed_at: 1700000000,
				},
			],
		});

		const res = await postSession(payload);
		expect(res.status).toBe(200);

		const commits = await db.getCommitsBySha("no-branch-sha");
		expect(commits).toHaveLength(1);
		expect(commits[0].branch).toBeNull();
	});

	it("handles multiple commits for one session", async () => {
		const payload = makeBody({
			commits: [
				{
					sha: "abc123",
					org: "my-org",
					repo: "my-repo",
					message: "first commit",
					author: "jane",
					committed_at: 1700000000,
					branch: "feature-x",
				},
				{
					sha: "def456",
					org: "my-org",
					repo: "my-repo",
					message: "second commit",
					author: "jane",
					committed_at: 1700003600,
					branch: "feature-x",
				},
			],
		});

		const res = await postSession(payload);
		expect(res.status).toBe(200);

		const commits1 = await db.getCommitsBySha("abc123");
		expect(commits1).toHaveLength(1);

		const commits2 = await db.getCommitsBySha("def456");
		expect(commits2).toHaveLength(1);
	});

	it("handles empty commits array", async () => {
		const res = await postSession(makeBody({ commits: [] }));
		expect(res.status).toBe(200);

		const session = await db.getSessionById("test-session-1");
		expect(session).not.toBeNull();
	});

	it("handles open session status (ended_at stays null)", async () => {
		const payload = makeBody();
		(payload.session as Record<string, unknown>).status = "open";

		const res = await postSession(payload);
		expect(res.status).toBe(200);

		const session = await db.getSessionById("test-session-1");
		expect(session).not.toBeNull();
		expect(session!.ended_at).toBeNull();
	});

	it("upserts session on duplicate (updates ended_at)", async () => {
		// First upload - open session
		const payload1 = makeBody();
		(payload1.session as Record<string, unknown>).status = "open";
		await postSession(payload1);

		// Second upload - ended session
		const payload2 = makeBody();
		(payload2.session as Record<string, unknown>).status = "ended";
		const res = await postSession(payload2);

		expect(res.status).toBe(200);

		// D1 should have ended_at set
		const session = await db.getSessionById("test-session-1");
		expect(session!.ended_at).not.toBeNull();
	});

	it("skips duplicate commit inserts without error", async () => {
		const payload = makeBody();
		await postSession(payload);
		const res = await postSession(payload);

		expect(res.status).toBe(200);

		const commits = await db.getCommitsBySha("abc123");
		expect(commits).toHaveLength(1);
	});

	it("does not touch R2 (data uploaded via presigned URL beforehand)", async () => {
		// Pre-populate R2 as if the CLI uploaded via presigned URL
		await env.BUCKET.put(
			"sessions/presigned-session.json",
			'{"messages": ["direct upload"]}',
			{ httpMetadata: { contentType: "application/json" } },
		);

		const payload = makeBody({
			session: {
				id: "presigned-session",
				agent: "claude-code",
				agent_version: "1.0.0",
				status: "ended",
			},
		});

		const res = await postSession(payload);
		expect(res.status).toBe(200);

		// D1 metadata should be stored
		const session = await db.getSessionById("presigned-session");
		expect(session).not.toBeNull();
		expect(session!.agent).toBe("claude-code");
		expect(session!.r2_key).toBe("sessions/presigned-session.json");

		// R2 data should be untouched
		const r2Object = await env.BUCKET.get("sessions/presigned-session.json");
		expect(r2Object).not.toBeNull();
		const text = await r2Object!.text();
		expect(text).toBe('{"messages": ["direct upload"]}');
	});

	it("stores commit files in D1 when provided", async () => {
		const payload = makeBody({
			commits: [
				{
					sha: "files-test-sha",
					org: "my-org",
					repo: "my-repo",
					message: "add auth module",
					author: "jane",
					committed_at: 1700000000,
					branch: "main",
					files: [
						{
							path: "src/auth.ts",
							change_type: "A",
							lines_added: 25,
							lines_deleted: 0,
						},
						{
							path: "src/index.ts",
							change_type: "M",
							lines_added: 3,
							lines_deleted: 1,
						},
					],
				},
			],
		});

		const res = await postSession(payload);
		expect(res.status).toBe(200);

		const files = await db.getCommitFiles("files-test-sha");
		expect(files).toHaveLength(2);

		const authFile = files.find((f) => f.file_path === "src/auth.ts");
		expect(authFile).toBeDefined();
		expect(authFile!.change_type).toBe("A");
		expect(authFile!.lines_added).toBe(25);
		expect(authFile!.lines_deleted).toBe(0);

		const indexFile = files.find((f) => f.file_path === "src/index.ts");
		expect(indexFile).toBeDefined();
		expect(indexFile!.change_type).toBe("M");
		expect(indexFile!.lines_added).toBe(3);
		expect(indexFile!.lines_deleted).toBe(1);
	});

	it("accepts commits without files field", async () => {
		const res = await postSession(makeBody());
		expect(res.status).toBe(200);

		const files = await db.getCommitFiles("abc123");
		expect(files).toHaveLength(0);
	});

	it("skips duplicate file inserts without error", async () => {
		const payload = makeBody({
			commits: [
				{
					sha: "dup-files-sha",
					org: "my-org",
					repo: "my-repo",
					message: "test",
					author: "jane",
					committed_at: 1700000000,
					branch: "main",
					files: [
						{
							path: "README.md",
							change_type: "M",
							lines_added: 1,
							lines_deleted: 0,
						},
					],
				},
			],
		});

		await postSession(payload);
		const res = await postSession(payload);
		expect(res.status).toBe(200);

		const files = await db.getCommitFiles("dup-files-sha");
		expect(files).toHaveLength(1);
	});
});
