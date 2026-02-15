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

async function seedRepo(org: string, repo: string, sessions = 1) {
	for (let i = 0; i < sessions; i++) {
		const sid = `s-${org}-${repo}-${i}`;
		await db.upsertSession({
			id: sid,
			agent: "pi",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: `sessions/${sid}.json`,
		});
		await db.insertCommit({
			commitSha: `sha-${org}-${repo}-${i}`,
			org,
			repo,
			sessionId: sid,
			message: `commit ${i}`,
			author: "jane",
			committedAt: 1700000000 + i * 100,
			branch: null,
		});
	}
}

describe("GET /app/:org (org page)", () => {
	it("returns 404 for unknown org", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/unknown-org", {
			headers,
		});
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("No data found");
	});

	it("lists repos for the org", async () => {
		await seedRepo("my-org", "repo-alpha");
		await seedRepo("my-org", "repo-beta");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/my-org", {
			headers,
		});
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("repo-alpha");
		expect(html).toContain("repo-beta");
	});

	it("shows breadcrumb navigation", async () => {
		await seedRepo("nav-org", "r");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/nav-org", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app"');
		expect(html).toContain("residue");
		expect(html).toContain("nav-org");
	});

	it("shows session and commit counts", async () => {
		await seedRepo("count-org", "counted-repo", 3);
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/count-org", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("3 sessions");
		expect(html).toContain("3 commits");
	});

	it("links to repo pages under /app", async () => {
		await seedRepo("link-org", "link-repo");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/link-org", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app/link-org/link-repo"');
	});
});
