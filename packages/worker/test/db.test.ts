import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../src/lib/db";

const db = new DB(env.DB);

describe("db helpers", () => {
	it("upsertSession creates a new session", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		const row = await db.getSessionById("s1");
		expect(row).not.toBeNull();
		expect(row!.agent).toBe("claude-code");
		expect(row!.agent_version).toBe("1.0.0");
		expect(row!.ended_at).toBeNull();
		expect(row!.r2_key).toBe("sessions/s1.json");
	});

	it("upsertSession updates ended_at when status is ended", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: "sessions/s1.json",
		});

		const row = await db.getSessionById("s1");
		expect(row!.ended_at).not.toBeNull();
	});

	it("insertCommit creates a commit row", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		await db.insertCommit({
			commitSha: "abc123",
			repo: "my-repo",
			org: "my-org",
			sessionId: "s1",
			message: "test commit",
			author: "jane",
			committedAt: 1700000000,
			branch: null,
		});

		const commits = await db.getCommitsBySha("abc123");
		expect(commits).toHaveLength(1);
		expect(commits[0].session_id).toBe("s1");
		expect(commits[0].org).toBe("my-org");
		expect(commits[0].repo).toBe("my-repo");
	});

	it("insertCommit skips duplicates", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		const commitParams = {
			commitSha: "abc123",
			repo: "my-repo",
			org: "my-org",
			sessionId: "s1",
			message: "test",
			author: "jane",
			committedAt: 1700000000,
			branch: null as string | null,
		};

		await db.insertCommit(commitParams);
		await db.insertCommit(commitParams); // should not throw

		const commits = await db.getCommitsBySha("abc123");
		expect(commits).toHaveLength(1);
	});

	it("getCommitsByRepo returns commits for org/repo", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		await db.insertCommit({
			commitSha: "abc",
			repo: "my-repo",
			org: "my-org",
			sessionId: "s1",
			message: "first",
			author: "jane",
			committedAt: 1700000000,
			branch: null,
		});

		await db.insertCommit({
			commitSha: "def",
			repo: "other-repo",
			org: "my-org",
			sessionId: "s1",
			message: "other",
			author: "jane",
			committedAt: 1700000000,
			branch: null,
		});

		const commits = await db.getCommitsByRepo({
			org: "my-org",
			repo: "my-repo",
		});
		expect(commits).toHaveLength(1);
		expect(commits[0].commit_sha).toBe("abc");
	});

	it("getOrgList returns orgs with repo counts", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		await db.insertCommit({
			commitSha: "a",
			repo: "repo1",
			org: "org1",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
			branch: null,
		});

		await db.insertCommit({
			commitSha: "b",
			repo: "repo2",
			org: "org1",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
			branch: null,
		});

		const orgs = await db.getOrgList();
		expect(orgs).toHaveLength(1);
		expect(orgs[0].org).toBe("org1");
		expect(orgs[0].repo_count).toBe(2);
	});

	it("getCommitGraphData limits by unique commits and returns all sessions", async () => {
		await db.upsertSession({
			id: "sA",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: "sessions/sA.json",
		});
		await db.upsertSession({
			id: "sB",
			agent: "pi",
			agentVersion: "0.5.0",
			status: "ended",
			r2Key: "sessions/sB.json",
		});

		// Commit 1 has 2 sessions, commit 2 has 1, commit 3 has 1
		await db.insertCommit({
			commitSha: "c1",
			repo: "r",
			org: "o",
			sessionId: "sA",
			message: "m1",
			author: "j",
			committedAt: 300,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "c1",
			repo: "r",
			org: "o",
			sessionId: "sB",
			message: "m1",
			author: "j",
			committedAt: 300,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "c2",
			repo: "r",
			org: "o",
			sessionId: "sA",
			message: "m2",
			author: "j",
			committedAt: 200,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "c3",
			repo: "r",
			org: "o",
			sessionId: "sB",
			message: "m3",
			author: "j",
			committedAt: 100,
			branch: null,
		});

		// Limit to 2 unique commits: should get c1 (2 rows) and c2 (1 row) = 3 rows total
		const rows = await db.getCommitGraphData({ org: "o", repo: "r", limit: 2 });
		const uniqueShas = [...new Set(rows.map((r) => r.commit_sha))];
		expect(uniqueShas).toHaveLength(2);
		expect(uniqueShas).toContain("c1");
		expect(uniqueShas).toContain("c2");
		// c1 has 2 sessions, so 3 total rows
		expect(rows).toHaveLength(3);
	});

	it("getCommitGraphData supports cursor-based pagination", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "ended",
			r2Key: "sessions/s1.json",
		});

		await db.insertCommit({
			commitSha: "c1",
			repo: "r",
			org: "o",
			sessionId: "s1",
			message: "m1",
			author: "j",
			committedAt: 300,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "c2",
			repo: "r",
			org: "o",
			sessionId: "s1",
			message: "m2",
			author: "j",
			committedAt: 200,
			branch: null,
		});
		await db.insertCommit({
			commitSha: "c3",
			repo: "r",
			org: "o",
			sessionId: "s1",
			message: "m3",
			author: "j",
			committedAt: 100,
			branch: null,
		});

		// Page 1: limit 2, no cursor
		const page1 = await db.getCommitGraphData({
			org: "o",
			repo: "r",
			limit: 2,
		});
		const page1Shas = [...new Set(page1.map((r) => r.commit_sha))];
		expect(page1Shas).toEqual(["c1", "c2"]);

		// Page 2: cursor = committed_at of last commit on page 1 (200)
		const page2 = await db.getCommitGraphData({
			org: "o",
			repo: "r",
			limit: 2,
			cursor: 200,
		});
		const page2Shas = [...new Set(page2.map((r) => r.commit_sha))];
		expect(page2Shas).toEqual(["c3"]);
	});

	it("getReposByOrg returns repos with session counts", async () => {
		await db.upsertSession({
			id: "s1",
			agent: "claude-code",
			agentVersion: "1.0.0",
			status: "open",
			r2Key: "sessions/s1.json",
		});

		await db.insertCommit({
			commitSha: "a",
			repo: "my-repo",
			org: "my-org",
			sessionId: "s1",
			message: "m",
			author: "j",
			committedAt: 1700000000,
			branch: null,
		});

		const repos = await db.getReposByOrg("my-org");
		expect(repos).toHaveLength(1);
		expect(repos[0].repo).toBe("my-repo");
		expect(repos[0].session_count).toBe(1);
	});
});
