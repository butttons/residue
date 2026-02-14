import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  upsertSession,
  insertCommit,
  getSessionById,
  getCommitsByRepo,
  getCommitsBySha,
  getOrgList,
  getReposByOrg,
} from "../src/lib/db";
import { applyMigrations } from "./utils";

beforeAll(async () => {
  await applyMigrations(env.DB);
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM commits").run();
  await env.DB.prepare("DELETE FROM sessions").run();
});

describe("db helpers", () => {
  it("upsertSession creates a new session", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    const row = await getSessionById({ db: env.DB, id: "s1" });
    expect(row).not.toBeNull();
    expect(row!.agent).toBe("claude-code");
    expect(row!.agent_version).toBe("1.0.0");
    expect(row!.ended_at).toBeNull();
    expect(row!.r2_key).toBe("sessions/s1.json");
  });

  it("upsertSession updates ended_at when status is ended", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "ended",
      r2Key: "sessions/s1.json",
    });

    const row = await getSessionById({ db: env.DB, id: "s1" });
    expect(row!.ended_at).not.toBeNull();
  });

  it("insertCommit creates a commit row", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    await insertCommit({
      db: env.DB,
      commitSha: "abc123",
      repo: "my-repo",
      org: "my-org",
      sessionId: "s1",
      message: "test commit",
      author: "jane",
      committedAt: 1700000000,
    });

    const commits = await getCommitsBySha({ db: env.DB, sha: "abc123" });
    expect(commits).toHaveLength(1);
    expect(commits[0].session_id).toBe("s1");
    expect(commits[0].org).toBe("my-org");
    expect(commits[0].repo).toBe("my-repo");
  });

  it("insertCommit skips duplicates", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    const commitParams = {
      db: env.DB,
      commitSha: "abc123",
      repo: "my-repo",
      org: "my-org",
      sessionId: "s1",
      message: "test",
      author: "jane",
      committedAt: 1700000000,
    };

    await insertCommit(commitParams);
    await insertCommit(commitParams); // should not throw

    const commits = await getCommitsBySha({ db: env.DB, sha: "abc123" });
    expect(commits).toHaveLength(1);
  });

  it("getCommitsByRepo returns commits for org/repo", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    await insertCommit({
      db: env.DB,
      commitSha: "abc",
      repo: "my-repo",
      org: "my-org",
      sessionId: "s1",
      message: "first",
      author: "jane",
      committedAt: 1700000000,
    });

    await insertCommit({
      db: env.DB,
      commitSha: "def",
      repo: "other-repo",
      org: "my-org",
      sessionId: "s1",
      message: "other",
      author: "jane",
      committedAt: 1700000000,
    });

    const commits = await getCommitsByRepo({
      db: env.DB,
      org: "my-org",
      repo: "my-repo",
    });
    expect(commits).toHaveLength(1);
    expect(commits[0].commit_sha).toBe("abc");
  });

  it("getOrgList returns orgs with repo counts", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    await insertCommit({
      db: env.DB,
      commitSha: "a",
      repo: "repo1",
      org: "org1",
      sessionId: "s1",
      message: "m",
      author: "j",
      committedAt: 1700000000,
    });

    await insertCommit({
      db: env.DB,
      commitSha: "b",
      repo: "repo2",
      org: "org1",
      sessionId: "s1",
      message: "m",
      author: "j",
      committedAt: 1700000000,
    });

    const orgs = await getOrgList({ db: env.DB });
    expect(orgs).toHaveLength(1);
    expect(orgs[0].org).toBe("org1");
    expect(orgs[0].repo_count).toBe(2);
  });

  it("getReposByOrg returns repos with session counts", async () => {
    await upsertSession({
      db: env.DB,
      id: "s1",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      r2Key: "sessions/s1.json",
    });

    await insertCommit({
      db: env.DB,
      commitSha: "a",
      repo: "my-repo",
      org: "my-org",
      sessionId: "s1",
      message: "m",
      author: "j",
      committedAt: 1700000000,
    });

    const repos = await getReposByOrg({ db: env.DB, org: "my-org" });
    expect(repos).toHaveLength(1);
    expect(repos[0].repo).toBe("my-repo");
    expect(repos[0].session_count).toBe(1);
  });
});
