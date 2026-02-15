import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };

const db = new DB(env.DB);

async function seedSession(opts: {
	id: string;
	agent?: string;
	agentVersion?: string;
	status?: "open" | "ended";
}) {
	await db.upsertSession({
		id: opts.id,
		agent: opts.agent ?? "claude-code",
		agentVersion: opts.agentVersion ?? "1.0.0",
		status: opts.status ?? "ended",
		r2Key: `sessions/${opts.id}.json`,
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
	await db.insertCommit({
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

type SessionEntry = {
	id: string;
	agent: string;
	agent_version: string | null;
	created_at: number;
	ended_at: number | null;
};

type ShaResponse = {
	commit: {
		sha: string;
		message: string | null;
		author: string | null;
		committed_at: number | null;
	};
	sessions: SessionEntry[];
};

describe("GET /api/repos/:org/:repo/:sha", () => {
	it("returns commit metadata and linked sessions", async () => {
		await seedSession({ id: "s1", agentVersion: "1.2.3" });
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
			"https://test.local/api/repos/my-org/my-repo/abc123",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<ShaResponse>();

		expect(body.commit.sha).toBe("abc123");
		expect(body.commit.message).toBe("fix auth");
		expect(body.commit.author).toBe("jane");
		expect(body.commit.committed_at).toBe(1700000000);

		expect(body.sessions).toHaveLength(1);
		expect(body.sessions[0].id).toBe("s1");
		expect(body.sessions[0].agent).toBe("claude-code");
		expect(body.sessions[0].agent_version).toBe("1.2.3");
		expect(body.sessions[0].created_at).toBeTypeOf("number");
	});

	it("returns multiple sessions for one commit", async () => {
		await seedSession({ id: "s1", agent: "claude-code" });
		await seedSession({ id: "s2", agent: "cursor" });
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s1",
		});
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "my-repo",
			sessionId: "s2",
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo/abc123",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(200);
		const body = await res.json<ShaResponse>();
		expect(body.sessions).toHaveLength(2);

		const agents = body.sessions.map((s) => s.agent).sort();
		expect(agents).toEqual(["claude-code", "cursor"]);
	});

	it("scopes to org/repo (same SHA in different repo returns 404)", async () => {
		await seedSession({ id: "s1" });
		await seedCommit({
			sha: "abc123",
			org: "my-org",
			repo: "other-repo",
			sessionId: "s1",
		});

		const res = await SELF.fetch(
			"https://test.local/api/repos/my-org/my-repo/abc123",
			{ headers: AUTH_HEADER },
		);
		expect(res.status).toBe(404);
	});
});
