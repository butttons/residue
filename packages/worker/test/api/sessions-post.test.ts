import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { DB } from "../../src/lib/db";
import { applyMigrations } from "../utils";

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

let db: DB;

beforeAll(async () => {
  await applyMigrations(env.DB);
  db = new DB(env.DB);
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM commits").run();
  await env.DB.prepare("DELETE FROM sessions").run();
});

describe("POST /api/sessions", () => {
  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeBody()),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when session.id is missing", async () => {
    const payload = makeBody();
    delete (payload.session as Record<string, unknown>).id;

    const res = await postSession(payload);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when session.agent is missing", async () => {
    const payload = makeBody();
    delete (payload.session as Record<string, unknown>).agent;

    const res = await postSession(payload);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when commits is not an array", async () => {
    const res = await postSession(makeBody({ commits: "not-array" }));
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid status value", async () => {
    const payload = makeBody();
    (payload.session as Record<string, unknown>).status = "invalid";

    const res = await postSession(payload);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Validation failed");
  });

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

  it("defaults agent_version to unknown when not provided", async () => {
    const payload = makeBody();
    delete (payload.session as Record<string, unknown>).agent_version;

    const res = await postSession(payload);
    expect(res.status).toBe(200);

    const session = await db.getSessionById("test-session-1");
    expect(session!.agent_version).toBe("unknown");
  });
});

describe("POST /api/sessions/upload-url", () => {
  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when session_id is missing", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when session_id is empty", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns a presigned URL for valid request", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "test-session-upload" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ url: string }>();
    expect(body.url).toBeDefined();
    expect(typeof body.url).toBe("string");
    expect(body.url).toContain("sessions/test-session-upload.json");
    expect(body.url).toContain("X-Amz-");
  });
});
