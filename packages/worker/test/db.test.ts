import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { DB } from "../src/lib/db";
import { applyMigrations } from "./utils";

let db: DB;

beforeAll(async () => {
  await applyMigrations(env.DB);
  db = new DB(env.DB);
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM commits").run();
  await env.DB.prepare("DELETE FROM sessions").run();
});

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
    });

    await db.insertCommit({
      commitSha: "def",
      repo: "other-repo",
      org: "my-org",
      sessionId: "s1",
      message: "other",
      author: "jane",
      committedAt: 1700000000,
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
    });

    await db.insertCommit({
      commitSha: "b",
      repo: "repo2",
      org: "org1",
      sessionId: "s1",
      message: "m",
      author: "j",
      committedAt: 1700000000,
    });

    const orgs = await db.getOrgList();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].org).toBe("org1");
    expect(orgs[0].repo_count).toBe(2);
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
    });

    const repos = await db.getReposByOrg("my-org");
    expect(repos).toHaveLength(1);
    expect(repos[0].repo).toBe("my-repo");
    expect(repos[0].session_count).toBe(1);
  });
});
