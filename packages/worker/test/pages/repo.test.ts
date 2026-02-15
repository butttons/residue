import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";
import { applyMigrations, sessionCookieHeader } from "../utils";

let db: DB;

beforeAll(async () => {
	await applyMigrations(env.DB);
	db = new DB(env.DB);
});

beforeEach(async () => {
	await env.DB.prepare("DELETE FROM commits").run();
	await env.DB.prepare("DELETE FROM sessions").run();
	await env.DB.prepare("DELETE FROM users").run();
});

async function seedSession(id: string, agent = "pi") {
	await db.upsertSession({
		id,
		agent,
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

describe("GET /app/:org/:repo (repo page)", () => {
	it("returns 404 for unknown repo", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/no-org/no-repo", {
			headers,
		});
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("No data found");
	});

	it("shows commit timeline", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "abc123def",
			org: "t-org",
			repo: "t-repo",
			sessionId: "s1",
			message: "fix the auth bug",
			author: "jane",
			committedAt: 1700000000,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/t-org/t-repo", {
			headers,
		});
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("abc123d"); // short SHA
		expect(html).toContain("fix the auth bug");
		expect(html).toContain("jane");
	});

	it("shows agent badges", async () => {
		await seedSession("s1", "claude-code");
		await seedCommit({
			sha: "abc",
			org: "b-org",
			repo: "b-repo",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/b-org/b-repo", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("claude-code");
	});

	it("links commits to permalink page", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "linksha123",
			org: "l-org",
			repo: "l-repo",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/l-org/l-repo", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app/l-org/l-repo/linksha123"');
	});

	it("shows breadcrumb navigation", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "a",
			org: "bc-org",
			repo: "bc-repo",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/bc-org/bc-repo", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app"');
		expect(html).toContain('href="/app/bc-org"');
		expect(html).toContain("bc-repo");
	});

	it("orders commits newest first", async () => {
		await seedSession("s1");
		await seedCommit({
			sha: "older-sha",
			org: "o-org",
			repo: "o-repo",
			sessionId: "s1",
			message: "older",
			author: "j",
			committedAt: 1700000000,
		});
		await seedCommit({
			sha: "newer-sha",
			org: "o-org",
			repo: "o-repo",
			sessionId: "s1",
			message: "newer",
			author: "j",
			committedAt: 1700003600,
		});

		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/o-org/o-repo", {
			headers,
		});
		const html = await res.text();
		const newerIdx = html.indexOf("newer-sh");
		const olderIdx = html.indexOf("older-sh");
		expect(newerIdx).toBeLessThan(olderIdx);
	});
});
