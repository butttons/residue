import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  readPending,
  writePending,
  addSession,
  updateSession,
  removeSession,
  getSession,
  getPendingPath,
  type PendingSession,
} from "@/lib/pending";
import { join } from "path";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;
let pendingPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-pending-test-"));
  const sessionsDir = join(tempDir, "ai-sessions");
  await mkdir(sessionsDir, { recursive: true });
  pendingPath = join(sessionsDir, "pending.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeSession(overrides: Partial<PendingSession> = {}): PendingSession {
  return {
    id: "test-session-1",
    agent: "claude-code",
    agent_version: "1.0.0",
    status: "open",
    data_path: "/tmp/session.jsonl",
    commits: [],
    ...overrides,
  };
}

describe("getPendingPath", () => {
  test("returns path and creates ai-sessions dir", async () => {
    const freshDir = join(tempDir, "fresh-git");
    const result = await getPendingPath(freshDir);
    expect(result.isOk()).toBe(true);
    const path = result._unsafeUnwrap();
    expect(path).toBe(join(freshDir, "ai-sessions", "pending.json"));

    const proc = Bun.spawn(["ls", join(freshDir, "ai-sessions")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});

describe("readPending", () => {
  test("returns empty array when file does not exist", async () => {
    const result = await readPending(pendingPath);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  test("reads existing sessions", async () => {
    const sessions = [makeSession()];
    await Bun.write(pendingPath, JSON.stringify(sessions));

    const result = await readPending(pendingPath);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(sessions);
  });
});

describe("writePending", () => {
  test("writes sessions to file", async () => {
    const sessions = [makeSession()];
    const result = await writePending({ path: pendingPath, sessions });
    expect(result.isOk()).toBe(true);

    const text = await Bun.file(pendingPath).text();
    expect(JSON.parse(text)).toEqual(sessions);
  });

  test("overwrites existing file", async () => {
    await writePending({ path: pendingPath, sessions: [makeSession({ id: "old" })] });
    await writePending({ path: pendingPath, sessions: [makeSession({ id: "new" })] });

    const result = await readPending(pendingPath);
    const sessions = result._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("new");
  });
});

describe("addSession", () => {
  test("appends session to empty queue", async () => {
    const session = makeSession();
    const result = await addSession({ path: pendingPath, session });
    expect(result.isOk()).toBe(true);

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(session);
  });

  test("appends session to existing queue", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1" }) });
    await addSession({ path: pendingPath, session: makeSession({ id: "s2" }) });

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[1].id).toBe("s2");
  });
});

describe("updateSession", () => {
  test("updates session status", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1", status: "open" }) });
    const result = await updateSession({
      path: pendingPath,
      id: "s1",
      updates: { status: "ended" },
    });
    expect(result.isOk()).toBe(true);

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions[0].status).toBe("ended");
  });

  test("updates session commits", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1", commits: [] }) });
    const result = await updateSession({
      path: pendingPath,
      id: "s1",
      updates: { commits: [{ sha: "abc123", branch: "main" }] },
    });
    expect(result.isOk()).toBe(true);

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions[0].commits).toEqual([{ sha: "abc123", branch: "main" }]);
  });

  test("migrates old string[] commits format on read", async () => {
    // Write old format directly to simulate pre-migration data
    const oldSession = {
      id: "old-1",
      agent: "claude-code",
      agent_version: "1.0.0",
      status: "open",
      data_path: "/tmp/test.jsonl",
      commits: ["sha1", "sha2"],
    };
    await Bun.write(pendingPath, JSON.stringify([oldSession]));

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions[0].commits).toEqual([
      { sha: "sha1", branch: "unknown" },
      { sha: "sha2", branch: "unknown" },
    ]);
  });

  test("returns error for non-existent session", async () => {
    const result = await updateSession({
      path: pendingPath,
      id: "nonexistent",
      updates: { status: "ended" },
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("Session not found");
  });

  test("preserves other sessions when updating one", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1" }) });
    await addSession({ path: pendingPath, session: makeSession({ id: "s2" }) });
    await updateSession({ path: pendingPath, id: "s1", updates: { status: "ended" } });

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].status).toBe("ended");
    expect(sessions[1].status).toBe("open");
  });
});

describe("removeSession", () => {
  test("removes session by ID", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1" }) });
    await addSession({ path: pendingPath, session: makeSession({ id: "s2" }) });

    const result = await removeSession({ path: pendingPath, id: "s1" });
    expect(result.isOk()).toBe(true);

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s2");
  });

  test("does nothing for non-existent ID", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1" }) });
    await removeSession({ path: pendingPath, id: "nonexistent" });

    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
  });
});

describe("getSession", () => {
  test("finds session by ID", async () => {
    await addSession({ path: pendingPath, session: makeSession({ id: "s1" }) });
    await addSession({ path: pendingPath, session: makeSession({ id: "s2" }) });

    const result = await getSession({ path: pendingPath, id: "s1" });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.id).toBe("s1");
  });

  test("returns undefined for non-existent ID", async () => {
    const result = await getSession({ path: pendingPath, id: "nonexistent" });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });
});
