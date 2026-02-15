import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";
import { sessionCookieHeader } from "../utils";

const db = new DB(env.DB);

async function seedData(org: string, repo: string) {
	const sessionId = `s-${org}-${repo}`;
	await db.upsertSession({
		id: sessionId,
		agent: "pi",
		agentVersion: "1.0.0",
		status: "ended",
		r2Key: `sessions/${sessionId}.json`,
	});
	await db.insertCommit({
		commitSha: `sha-${org}-${repo}`,
		org,
		repo,
		sessionId,
		message: "test commit",
		author: "jane",
		committedAt: 1700000000,
		branch: null,
	});
}

describe("GET /app (home page)", () => {
	it("returns HTML", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	it("shows empty state when no data", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain("No sessions uploaded yet");
		expect(html).toContain("residue init");
	});

	it("lists orgs when data exists", async () => {
		await seedData("my-org", "my-repo");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain("my-org");
		expect(html).toContain("1 repo");
	});

	it("links to org pages under /app", async () => {
		await seedData("test-org", "repo1");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain('href="/app/test-org"');
	});

	it("shows multiple orgs", async () => {
		await seedData("org-a", "repo1");
		await seedData("org-b", "repo2");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain("org-a");
		expect(html).toContain("org-b");
	});

	it("shows repo count per org", async () => {
		await seedData("multi", "repo1");
		await seedData("multi", "repo2");
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain("2 repos");
	});
});
