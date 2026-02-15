import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";
import { sessionCookieHeader } from "../utils";

const db = new DB(env.DB);

const PI_SESSION_DATA = [
	'{"type":"session","id":"test-session"}',
	'{"type":"message","id":"m1","parentId":null,"message":{"role":"user","content":"hello world","timestamp":1700000000}}',
	'{"type":"message","id":"m2","parentId":"m1","message":{"role":"assistant","content":"Hi! How can I help?","model":"claude-3.5-sonnet","timestamp":1700000001}}',
].join("\n");

async function seedFullCommit(opts: {
	sha: string;
	org: string;
	repo: string;
	sessionId: string;
	agent?: string;
	message?: string;
	sessionData?: string;
}) {
	const agent = opts.agent ?? "pi";
	await db.upsertSession({
		id: opts.sessionId,
		agent,
		agentVersion: "1.0.0",
		status: "ended",
		r2Key: `sessions/${opts.sessionId}.json`,
	});
	await env.BUCKET.put(
		`sessions/${opts.sessionId}.json`,
		opts.sessionData ?? PI_SESSION_DATA,
	);
	await db.insertCommit({
		commitSha: opts.sha,
		org: opts.org,
		repo: opts.repo,
		sessionId: opts.sessionId,
		message: opts.message ?? "test commit",
		author: "jane",
		committedAt: 1700000000,
		branch: null,
	});
}

describe("GET /app/:org/:repo/:sha (commit page)", () => {
	it("returns 404 for unknown commit", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/no-org/no-repo/no-sha",
			{ headers },
		);
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("Commit not found");
	});

	it("shows commit metadata", async () => {
		await seedFullCommit({
			sha: "abc123def456",
			org: "c-org",
			repo: "c-repo",
			sessionId: "s1",
			message: "fix critical auth bug",
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/c-org/c-repo/abc123def456",
			{ headers },
		);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("abc123def456");
		expect(html).toContain("fix critical auth bug");
		expect(html).toContain("jane");
	});

	it("renders conversation from session data", async () => {
		await seedFullCommit({
			sha: "conv-sha",
			org: "c-org",
			repo: "c-repo",
			sessionId: "conv-session",
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/c-org/c-repo/conv-sha",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("hello world");
		expect(html).toContain("Hi! How can I help?");
		expect(html).toContain("human");
		expect(html).toContain("assistant");
	});

	it("shows breadcrumb navigation", async () => {
		await seedFullCommit({
			sha: "bc-sha-123",
			org: "bc-org",
			repo: "bc-repo",
			sessionId: "bc-session",
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/bc-org/bc-repo/bc-sha-123",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain('href="/app"');
		expect(html).toContain('href="/app/bc-org"');
		expect(html).toContain('href="/app/bc-org/bc-repo"');
		expect(html).toContain("bc-sha-");
	});

	it("shows agent badge", async () => {
		await seedFullCommit({
			sha: "agent-sha",
			org: "a-org",
			repo: "a-repo",
			sessionId: "agent-session",
			agent: "pi",
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/a-org/a-repo/agent-sha",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("pi");
	});

	it("shows continuation links for multi-commit sessions", async () => {
		const sessionId = "multi-session";
		await db.upsertSession({
			id: sessionId,
			agent: "pi",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: `sessions/${sessionId}.json`,
		});
		await env.BUCKET.put(`sessions/${sessionId}.json`, PI_SESSION_DATA);

		await db.insertCommit({
			commitSha: "first-sha",
			org: "m-org",
			repo: "m-repo",
			sessionId,
			message: "first",
			author: "jane",
			committedAt: 1700000000,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "second-sha",
			org: "m-org",
			repo: "m-repo",
			sessionId,
			message: "second",
			author: "jane",
			committedAt: 1700001000,
			branch: null,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/m-org/m-repo/second-sha",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("Continues from");
		expect(html).toContain("first-s");

		const res2 = await SELF.fetch(
			"https://test.local/app/m-org/m-repo/first-sha",
			{ headers },
		);
		const html2 = await res2.text();
		expect(html2).toContain("Continues in");
		expect(html2).toContain("second-");
	});

	it("handles missing R2 data gracefully", async () => {
		await db.upsertSession({
			id: "no-r2",
			agent: "pi",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: "sessions/no-r2.json",
		});
		await db.insertCommit({
			commitSha: "no-r2-sha",
			org: "n-org",
			repo: "n-repo",
			sessionId: "no-r2",
			message: "test",
			author: "jane",
			committedAt: 1700000000,
			branch: null,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/n-org/n-repo/no-r2-sha",
			{ headers },
		);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("No conversation data");
	});
});
