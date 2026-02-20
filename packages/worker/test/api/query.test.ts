import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDL } from "../../src/lib/db";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };
const DL = createDL({ db: env.DB });

async function seedSession(opts: {
	id: string;
	agent?: string;
	agentVersion?: string;
	status?: string;
	dataPath?: string;
	firstMessage?: string;
	sessionName?: string;
}) {
	await DL.sessions.upsert({
		id: opts.id,
		agent: opts.agent ?? "claude-code",
		agentVersion: opts.agentVersion ?? "1.0.0",
		status: opts.status ?? "ended",
		r2Key: `sessions/${opts.id}.json`,
		dataPath: opts.dataPath ?? null,
		firstMessage: opts.firstMessage ?? null,
		sessionName: opts.sessionName ?? null,
	});
}

async function seedCommit(opts: {
	sha: string;
	org: string;
	repo: string;
	sessionId: string;
	message?: string;
	author?: string;
	committedAt?: number;
	branch?: string;
}) {
	await DL.commits.insert({
		commitSha: opts.sha,
		org: opts.org,
		repo: opts.repo,
		sessionId: opts.sessionId,
		message: opts.message ?? "test commit",
		author: opts.author ?? "jane",
		committedAt: opts.committedAt ?? 1700000000,
		branch: opts.branch ?? null,
	});
}

describe("GET /api/query/sessions", () => {
	it("returns all sessions when no filters", async () => {
		await seedSession({ id: "qs-1" });
		await seedSession({ id: "qs-2", agent: "pi" });

		const res = await SELF.fetch("https://test.local/api/query/sessions", {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = await res.json<{ sessions: unknown[] }>();
		expect(body.sessions.length).toBeGreaterThanOrEqual(2);
	});

	it("filters by agent", async () => {
		await seedSession({ id: "qs-agent-1", agent: "claude-code" });
		await seedSession({ id: "qs-agent-2", agent: "pi" });

		const res = await SELF.fetch(
			"https://test.local/api/query/sessions?agent=pi",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{
			sessions: { id: string; agent: string }[];
		}>();
		const piSessions = body.sessions.filter((s) => s.id === "qs-agent-2");
		expect(piSessions.length).toBe(1);
		expect(piSessions[0].agent).toBe("pi");
		// Should not include the claude-code session
		const ccSessions = body.sessions.filter((s) => s.id === "qs-agent-1");
		expect(ccSessions.length).toBe(0);
	});

	it("filters by repo", async () => {
		await seedSession({ id: "qs-repo-1" });
		await seedSession({ id: "qs-repo-2" });
		await seedCommit({
			sha: "sha-repo-1",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qs-repo-1",
		});
		await seedCommit({
			sha: "sha-repo-2",
			org: "other-org",
			repo: "other-repo",
			sessionId: "qs-repo-2",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/sessions?repo=my-org/my-repo",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ sessions: { id: string }[] }>();
		const ids = body.sessions.map((s) => s.id);
		expect(ids).toContain("qs-repo-1");
		expect(ids).not.toContain("qs-repo-2");
	});

	it("filters by branch", async () => {
		await seedSession({ id: "qs-branch-1" });
		await seedSession({ id: "qs-branch-2" });
		await seedCommit({
			sha: "sha-b1",
			org: "o",
			repo: "r",
			sessionId: "qs-branch-1",
			branch: "main",
		});
		await seedCommit({
			sha: "sha-b2",
			org: "o",
			repo: "r",
			sessionId: "qs-branch-2",
			branch: "feature",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/sessions?branch=feature",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ sessions: { id: string }[] }>();
		const ids = body.sessions.map((s) => s.id);
		expect(ids).toContain("qs-branch-2");
		expect(ids).not.toContain("qs-branch-1");
	});

	it("returns session metadata fields", async () => {
		await seedSession({
			id: "qs-meta-1",
			dataPath: "/home/user/.pi/sessions/abc.jsonl",
			firstMessage: "fix the auth bug",
			sessionName: "fix-auth-bug",
		});

		const res = await SELF.fetch("https://test.local/api/query/sessions", {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = await res.json<{
			sessions: {
				id: string;
				data_path: string | null;
				first_message: string | null;
				session_name: string | null;
			}[];
		}>();
		const session = body.sessions.find((s) => s.id === "qs-meta-1");
		expect(session).toBeDefined();
		expect(session!.data_path).toBe("/home/user/.pi/sessions/abc.jsonl");
		expect(session!.first_message).toBe("fix the auth bug");
		expect(session!.session_name).toBe("fix-auth-bug");
	});

	it("supports limit and offset", async () => {
		await seedSession({ id: "qs-page-1" });
		await seedSession({ id: "qs-page-2" });
		await seedSession({ id: "qs-page-3" });

		const res = await SELF.fetch(
			"https://test.local/api/query/sessions?limit=1&offset=0",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ sessions: unknown[] }>();
		expect(body.sessions.length).toBe(1);
	});

	it("rejects invalid since parameter", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/query/sessions?since=notanumber",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(400);
	});
});

describe("GET /api/query/commits", () => {
	it("returns commits grouped by SHA with session IDs", async () => {
		await seedSession({ id: "qc-s1" });
		await seedCommit({
			sha: "qc-sha-1",
			org: "o",
			repo: "r",
			sessionId: "qc-s1",
			message: "test commit",
		});

		const res = await SELF.fetch("https://test.local/api/query/commits", {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = await res.json<{
			commits: { sha: string; session_ids: string[] }[];
		}>();
		const commit = body.commits.find((c) => c.sha === "qc-sha-1");
		expect(commit).toBeDefined();
		expect(commit!.session_ids).toContain("qc-s1");
	});

	it("filters by repo", async () => {
		await seedSession({ id: "qc-repo-s1" });
		await seedSession({ id: "qc-repo-s2" });
		await seedCommit({
			sha: "qc-repo-1",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qc-repo-s1",
		});
		await seedCommit({
			sha: "qc-repo-2",
			org: "other",
			repo: "other",
			sessionId: "qc-repo-s2",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/commits?repo=my-org/my-repo",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ commits: { sha: string }[] }>();
		const shas = body.commits.map((c) => c.sha);
		expect(shas).toContain("qc-repo-1");
		expect(shas).not.toContain("qc-repo-2");
	});

	it("filters by author", async () => {
		await seedSession({ id: "qc-auth-s1" });
		await seedCommit({
			sha: "qc-auth-1",
			org: "o",
			repo: "r",
			sessionId: "qc-auth-s1",
			author: "alice",
		});
		await seedCommit({
			sha: "qc-auth-2",
			org: "o",
			repo: "r",
			sessionId: "qc-auth-s1",
			author: "bob",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/commits?author=alice",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ commits: { sha: string }[] }>();
		const shas = body.commits.map((c) => c.sha);
		expect(shas).toContain("qc-auth-1");
		expect(shas).not.toContain("qc-auth-2");
	});

	it("filters by branch", async () => {
		await seedSession({ id: "qc-br-s1" });
		await seedCommit({
			sha: "qc-br-1",
			org: "o",
			repo: "r",
			sessionId: "qc-br-s1",
			branch: "main",
		});
		await seedCommit({
			sha: "qc-br-2",
			org: "o",
			repo: "r",
			sessionId: "qc-br-s1",
			branch: "dev",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/commits?branch=main",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ commits: { sha: string }[] }>();
		const shas = body.commits.map((c) => c.sha);
		expect(shas).toContain("qc-br-1");
		expect(shas).not.toContain("qc-br-2");
	});

	it("groups multiple sessions under one commit SHA", async () => {
		await seedSession({ id: "qc-grp-s1" });
		await seedSession({ id: "qc-grp-s2" });
		await seedCommit({
			sha: "qc-grp-sha",
			org: "o",
			repo: "r",
			sessionId: "qc-grp-s1",
		});
		await seedCommit({
			sha: "qc-grp-sha",
			org: "o",
			repo: "r",
			sessionId: "qc-grp-s2",
		});

		const res = await SELF.fetch("https://test.local/api/query/commits", {
			headers: AUTH_HEADER,
		});
		expect(res.status).toBe(200);
		const body = await res.json<{
			commits: { sha: string; session_ids: string[] }[];
		}>();
		const commit = body.commits.find((c) => c.sha === "qc-grp-sha");
		expect(commit).toBeDefined();
		expect(commit!.session_ids).toContain("qc-grp-s1");
		expect(commit!.session_ids).toContain("qc-grp-s2");
	});
});

describe("GET /api/query/sessions/:id", () => {
	it("returns session detail with commits", async () => {
		await seedSession({
			id: "qsd-1",
			agent: "pi",
			dataPath: "/path/to/session.jsonl",
			firstMessage: "hello",
			sessionName: "my-session",
		});
		await seedCommit({
			sha: "qsd-sha-1",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qsd-1",
			message: "first commit",
			branch: "main",
		});
		await seedCommit({
			sha: "qsd-sha-2",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qsd-1",
			message: "second commit",
			branch: "main",
			committedAt: 1700003600,
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/sessions/qsd-1",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{
			session: {
				id: string;
				agent: string;
				data_path: string | null;
				first_message: string | null;
				session_name: string | null;
			};
			commits: {
				commit_sha: string;
				message: string | null;
				org: string;
				repo: string;
			}[];
		}>();
		expect(body.session.id).toBe("qsd-1");
		expect(body.session.agent).toBe("pi");
		expect(body.session.data_path).toBe("/path/to/session.jsonl");
		expect(body.session.first_message).toBe("hello");
		expect(body.session.session_name).toBe("my-session");
		expect(body.commits).toHaveLength(2);
		expect(body.commits[0].commit_sha).toBe("qsd-sha-1");
		expect(body.commits[1].commit_sha).toBe("qsd-sha-2");
	});

	it("returns 404 for unknown session", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/query/sessions/nonexistent",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(404);
	});
});

describe("GET /api/query/commits/:sha", () => {
	it("returns commit detail with linked sessions", async () => {
		await seedSession({ id: "qcd-s1", agent: "claude-code" });
		await seedSession({ id: "qcd-s2", agent: "pi" });
		await seedCommit({
			sha: "qcd-sha-1",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qcd-s1",
			message: "multi-session commit",
			author: "jane",
			committedAt: 1700000000,
			branch: "main",
		});
		await seedCommit({
			sha: "qcd-sha-1",
			org: "my-org",
			repo: "my-repo",
			sessionId: "qcd-s2",
			message: "multi-session commit",
			author: "jane",
			committedAt: 1700000000,
			branch: "main",
		});

		const res = await SELF.fetch(
			"https://test.local/api/query/commits/qcd-sha-1",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{
			commit_sha: string;
			message: string;
			author: string;
			sessions: { id: string; agent: string }[];
		}>();
		expect(body.commit_sha).toBe("qcd-sha-1");
		expect(body.message).toBe("multi-session commit");
		expect(body.author).toBe("jane");
		expect(body.sessions).toHaveLength(2);
		const agents = body.sessions.map((s) => s.agent).sort();
		expect(agents).toEqual(["claude-code", "pi"]);
	});

	it("returns 404 for unknown commit", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/query/commits/nonexistent",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(404);
	});
});
