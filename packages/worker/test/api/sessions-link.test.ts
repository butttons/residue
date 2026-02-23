import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDL } from "../../src/lib/db";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };
const DL = createDL({ db: env.DB });

async function seedSession(opts: {
	sessionId: string;
	commitSha: string;
	org?: string;
	repo?: string;
	branch?: string;
	message?: string;
	author?: string;
}) {
	const res = await SELF.fetch("https://test.local/api/sessions", {
		method: "POST",
		headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
		body: JSON.stringify({
			session: {
				id: opts.sessionId,
				agent: "claude-code",
				agent_version: "1.0.0",
				status: "ended",
			},
			commits: [
				{
					sha: opts.commitSha,
					org: opts.org ?? "my-org",
					repo: opts.repo ?? "my-repo",
					message: opts.message ?? "test commit",
					author: opts.author ?? "tester",
					committed_at: 1700000000,
					branch: opts.branch ?? "main",
				},
			],
		}),
	});
	expect(res.status).toBe(200);
}

describe("DELETE /api/sessions/:id/commits/:sha", () => {
	it("unlinks a session from a commit", async () => {
		await seedSession({ sessionId: "unlink-1", commitSha: "sha-unlink-1" });

		const commits = (await DL.commits.getBySha("sha-unlink-1")).value;
		expect(commits).toHaveLength(1);

		const res = await SELF.fetch(
			"https://test.local/api/sessions/unlink-1/commits/sha-unlink-1",
			{ method: "DELETE", headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ ok: boolean }>();
		expect(body.ok).toBe(true);

		const after = (await DL.commits.getBySha("sha-unlink-1")).value;
		expect(after).toHaveLength(0);
	});

	it("returns 404 when link does not exist", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/sessions/nonexistent/commits/nonexistent",
			{ method: "DELETE", headers: AUTH_HEADER },
		);
		expect(res.status).toBe(404);
	});

	it("only unlinks the specified session, not others on the same commit", async () => {
		await seedSession({ sessionId: "unlink-a", commitSha: "sha-shared" });
		await seedSession({ sessionId: "unlink-b", commitSha: "sha-shared" });

		const before = (await DL.commits.getBySha("sha-shared")).value;
		expect(before).toHaveLength(2);

		const res = await SELF.fetch(
			"https://test.local/api/sessions/unlink-a/commits/sha-shared",
			{ method: "DELETE", headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);

		const after = (await DL.commits.getBySha("sha-shared")).value;
		expect(after).toHaveLength(1);
		expect(after[0].session_id).toBe("unlink-b");
	});

	it("requires auth", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/sessions/x/commits/y",
			{ method: "DELETE" },
		);
		expect(res.status).toBe(401);
	});
});

describe("POST /api/sessions/:id/commits/:sha", () => {
	it("links an existing session to a new commit with explicit metadata", async () => {
		await seedSession({ sessionId: "link-1", commitSha: "sha-original" });

		const res = await SELF.fetch(
			"https://test.local/api/sessions/link-1/commits/sha-new",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify({
					org: "my-org",
					repo: "my-repo",
					message: "manually linked",
					author: "admin",
					committed_at: 1700003600,
					branch: "main",
				}),
			},
		);
		expect(res.status).toBe(200);
		const body = await res.json<{ ok: boolean }>();
		expect(body.ok).toBe(true);

		const commits = (await DL.commits.getBySha("sha-new")).value;
		expect(commits).toHaveLength(1);
		expect(commits[0].session_id).toBe("link-1");
		expect(commits[0].message).toBe("manually linked");
	});

	it("auto-fills metadata from existing commit row when org/repo omitted", async () => {
		await seedSession({
			sessionId: "link-auto-src",
			commitSha: "sha-auto",
			org: "auto-org",
			repo: "auto-repo",
			message: "original message",
			author: "original-author",
			branch: "feature-x",
		});

		// Create a second session to link to the same commit, without providing org/repo
		await seedSession({
			sessionId: "link-auto-dst",
			commitSha: "sha-seed-only",
		});

		const res = await SELF.fetch(
			"https://test.local/api/sessions/link-auto-dst/commits/sha-auto",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(res.status).toBe(200);

		const commits = (await DL.commits.getBySha("sha-auto")).value;
		const linked = commits.find((c) => c.session_id === "link-auto-dst");
		expect(linked).toBeDefined();
		expect(linked!.org).toBe("auto-org");
		expect(linked!.repo).toBe("auto-repo");
		expect(linked!.message).toBe("original message");
		expect(linked!.author).toBe("original-author");
		expect(linked!.branch).toBe("feature-x");
	});

	it("returns 400 when org/repo omitted and commit does not exist", async () => {
		await seedSession({
			sessionId: "link-nocommit",
			commitSha: "sha-nocommit-seed",
		});

		const res = await SELF.fetch(
			"https://test.local/api/sessions/link-nocommit/commits/sha-totally-new",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(res.status).toBe(400);
		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("org and repo are required");
	});

	it("returns 404 when session does not exist", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/sessions/nonexistent-session/commits/sha-x",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify({ org: "o", repo: "r" }),
			},
		);
		expect(res.status).toBe(404);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Session not found");
	});

	it("is idempotent (duplicate link does not error)", async () => {
		await seedSession({ sessionId: "link-idem", commitSha: "sha-idem" });

		const linkBody = {
			org: "my-org",
			repo: "my-repo",
			message: "same link",
			author: "admin",
			committed_at: 1700000000,
			branch: "main",
		};

		const res1 = await SELF.fetch(
			"https://test.local/api/sessions/link-idem/commits/sha-idem-2",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify(linkBody),
			},
		);
		expect(res1.status).toBe(200);

		const res2 = await SELF.fetch(
			"https://test.local/api/sessions/link-idem/commits/sha-idem-2",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify(linkBody),
			},
		);
		expect(res2.status).toBe(200);

		const commits = (await DL.commits.getBySha("sha-idem-2")).value;
		expect(commits).toHaveLength(1);
	});

	it("works with only org and repo", async () => {
		await seedSession({ sessionId: "link-min", commitSha: "sha-min" });

		const res = await SELF.fetch(
			"https://test.local/api/sessions/link-min/commits/sha-min-2",
			{
				method: "POST",
				headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
				body: JSON.stringify({ org: "my-org", repo: "my-repo" }),
			},
		);
		expect(res.status).toBe(200);

		const commits = (await DL.commits.getBySha("sha-min-2")).value;
		expect(commits).toHaveLength(1);
		expect(commits[0].message).toBeNull();
		expect(commits[0].author).toBeNull();
		expect(commits[0].branch).toBeNull();
	});

	it("requires auth", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/sessions/x/commits/y",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ org: "o", repo: "r" }),
			},
		);
		expect(res.status).toBe(401);
	});
});
