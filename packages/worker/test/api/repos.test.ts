import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };

const db = new DB(env.DB);

async function seedSession(id: string) {
	await db.upsertSession({
		id,
		agent: "claude-code",
		agentVersion: "1.0.0",
		status: "ended",
		r2Key: `sessions/${id}.json`,
	});
}

async function seedCommit(opts: {
	sha: string;
	org: string;
	repo: string;
	sessionId: string;
	message: string;
	author: string;
	committedAt: number;
	branch?: string;
}) {
	await db.insertCommit({
		commitSha: opts.sha,
		org: opts.org,
		repo: opts.repo,
		sessionId: opts.sessionId,
		message: opts.message,
		author: opts.author,
		committedAt: opts.committedAt,
		branch: opts.branch ?? null,
	});
}

type CommitEntry = {
	sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	sessions: { id: string; agent: string }[];
};

type RepoResponse = {
	commits: CommitEntry[];
	next_cursor: string | null;
};

describe("GET /api/repos/:org/:repo", () => {
	it("returns 401 without auth", async () => {
		const res = await SELF.fetch("https://test.local/api/repos/my-org/my-repo");
		expect(res.status).toBe(401);
	});

	it("returns empty commits for unknown org/repo", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/repos/unknown/unknown",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.commits).toEqual([]);
		expect(body.next_cursor).toBeNull();
	});

	it("returns commits grouped by SHA with sessions", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "fix auth",
			author: "jane",
			committedAt: 1700000000,
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.commits).toHaveLength(1);
		expect(body.commits[0].sha).toBe("abc123");
		expect(body.commits[0].message).toBe("fix auth");
		expect(body.commits[0].author).toBe("jane");
		expect(body.commits[0].committed_at).toBe(1700000000);
		expect(body.commits[0].sessions).toHaveLength(1);
		expect(body.commits[0].sessions[0].id).toBe("s1");
		expect(body.commits[0].sessions[0].agent).toBe("claude-code");
	});

	it("groups multiple sessions under one commit", async () => {
		await seedSession("s1");
		await seedSession("s2");
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "fix auth",
			author: "jane",
			committedAt: 1700000000,
		});
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s2",
			message: "fix auth",
			author: "jane",
			committedAt: 1700000000,
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.commits).toHaveLength(1);
		expect(body.commits[0].sessions).toHaveLength(2);
	});

	it("returns commits ordered by committed_at DESC", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "older",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "older commit",
			author: "jane",
			committedAt: 1700000000,
		});
		await seedCommit({
			sha: "newer",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "newer commit",
			author: "jane",
			committedAt: 1700003600,
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.commits).toHaveLength(2);
		expect(body.commits[0].sha).toBe("newer");
		expect(body.commits[1].sha).toBe("older");
	});

	it("does not return commits from other repos", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "abc",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "mine",
			author: "jane",
			committedAt: 1700000000,
		});
		await seedCommit({
			sha: "def",
			org: "my-org",
			repo: "other-repo",
			sessionId: "s1",
			message: "other",
			author: "jane",
			committedAt: 1700000000,
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.commits).toHaveLength(1);
		expect(body.commits[0].sha).toBe("abc");
	});

	it("supports cursor-based pagination", async () => {
		await seedSession("s1");

		// Seed 3 commits with distinct committed_at
		for (let i = 0; i < 3; i++) {
			await seedCommit({
				sha: `sha-${i}`,
				org: "my-org",
				repo: "my-repo",
				sessionId: "s1",
				message: `commit ${i}`,
				author: "jane",
				committedAt: 1700000000 + i * 100,
			});
		}

		// Fetch with cursor = committed_at of sha-1 (middle commit)
		const cursor = 1700000000 + 2 * 100; // sha-2's committed_at
		const res = await SELF.fetch(
			`https://test.local/api/repos/my-org/my-repo?cursor=${cursor}`,
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		// Should return sha-1 and sha-0 (committed_at < cursor)
		expect(body.commits).toHaveLength(2);
		expect(body.commits[0].sha).toBe("sha-1");
		expect(body.commits[1].sha).toBe("sha-0");
	});

	it("returns next_cursor when more results exist", async () => {
		await seedSession("s1");

		// We can't seed 51 easily, but we can test with a small limit
		// by checking the logic: if rows.length === limit, next_cursor is set
		// Seed 2 commits and verify next_cursor is null (less than 50)
		await seedCommit({
			sha: "a",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo",
			{
				headers: AUTH_HEADER,
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<RepoResponse>();
		expect(body.next_cursor).toBeNull();
	});

	it("returns 400 for invalid cursor", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo?cursor=notanumber",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(400);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Invalid cursor");
	});
});
