import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, utimes } from "fs/promises";
import { tmpdir } from "os";
import { readPending } from "@/lib/pending";

let tempDir: string;
let fakeHome: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

async function gitExec(args: string[]) {
  const proc = Bun.spawn(["git", ...args], {
    cwd: tempDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return (await new Response(proc.stdout).text()).trim();
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-sync-test-"));
  fakeHome = await mkdtemp(join(tmpdir(), "residue-sync-home-"));
  await gitExec(["init"]);
  await gitExec(["config", "user.email", "test@test.com"]);
  await gitExec(["config", "user.name", "Test"]);
  await gitExec(["remote", "add", "origin", "git@github.com:my-org/my-repo.git"]);
  await writeFile(join(tempDir, "README.md"), "init");
  await gitExec(["add", "."]);
  await gitExec(["commit", "-m", "initial"]);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(fakeHome, { recursive: true, force: true });
});

function cli(args: string[], env?: Record<string, string>) {
  return Bun.spawn(["bun", entry, ...args], {
    cwd: tempDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: fakeHome, DEBUG: "residue:*", ...env },
  });
}

async function setupConfig(opts: { workerUrl: string; token: string }) {
  const configDir = join(fakeHome, ".residue");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "config"),
    JSON.stringify({ worker_url: opts.workerUrl, token: opts.token })
  );
}

type RequestLog = {
  method: string;
  url: string;
  body: unknown;
  auth: string | null;
};

function createMockServer() {
  const requests: RequestLog[] = [];

  // Worker mock — single POST /api/sessions with inline data
  const workerServer = Bun.serve({
    port: 0,
    fetch(req) {
      return (async () => {
        const url = new URL(req.url);
        const body = await req.json();

        requests.push({
          method: req.method,
          url: url.pathname,
          body,
          auth: req.headers.get("authorization"),
        });

        if (url.pathname === "/api/sessions") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        return new Response("not found", { status: 404 });
      })();
    },
  });

  return {
    workerUrl: `http://localhost:${workerServer.port}`,
    requests,
    stop() {
      workerServer.stop();
    },
  };
}

describe("sync command", () => {
  test("exits 0 when not configured", async () => {
    const proc = cli(["sync"]);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Not configured");
  });

  test("exits 0 when no pending sessions", async () => {
    await setupConfig({ workerUrl: "http://localhost:9999", token: "test" });

    const proc = cli(["sync"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("uploads session data to R2 and metadata to worker, removes ended session", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "my-token" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, '{"role":"user","content":"hello"}');

      // Create a session, capture while open, then end it
      const startProc = cli(["session", "start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const endProc = cli(["session", "end", "--id", sessionId]);
      await endProc.exited;

      // Sync
      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain("synced session");
      expect(stderr).toContain(sessionId);

      // Should have 1 request: POST /api/sessions with inline data
      expect(mock.requests).toHaveLength(1);

      const req = mock.requests[0];
      expect(req.url).toBe("/api/sessions");
      expect(req.method).toBe("POST");
      expect(req.auth).toBe("Bearer my-token");

      const body = req.body as { session: Record<string, unknown>; commits: Array<Record<string, unknown>> };
      expect(body.session.id).toBe(sessionId);
      expect(body.session.agent).toBe("claude-code");
      expect(body.session.status).toBe("ended");
      expect(body.session.data).toBe('{"role":"user","content":"hello"}');
      expect(body.commits).toHaveLength(1);
      expect(body.commits[0].org).toBe("my-org");
      expect(body.commits[0].repo).toBe("my-repo");
      expect(typeof body.commits[0].branch).toBe("string");
      expect((body.commits[0].branch as string).length).toBeGreaterThan(0);

      // Ended session removed from pending
      const pendingPath = join(tempDir, ".residue/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(0);
    } finally {
      mock.stop();
    }
  });

  test("keeps open sessions in pending after sync", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "data");

      const startProc = cli(["session", "start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const syncProc = cli(["sync"]);
      await syncProc.exited;

      const pendingPath = join(tempDir, ".residue/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe("open");
    } finally {
      mock.stop();
    }
  });

  test("uses --remote-url for org/repo inference when provided", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "data");

      const startProc = cli(["session", "start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const endProc = cli(["session", "end", "--id", (await new Response(startProc.stdout).text()).trim()]);
      await endProc.exited;

      // Sync with a different remote URL (not origin)
      const syncProc = cli(["sync", "--remote-url", "git@github.com:other-org/other-repo.git"]);
      const exitCode = await syncProc.exited;

      expect(exitCode).toBe(0);
      expect(mock.requests).toHaveLength(1);

      const body = mock.requests[0].body as { commits: Array<{ org: string; repo: string; branch: string }> };
      expect(body.commits[0].org).toBe("other-org");
      expect(body.commits[0].repo).toBe("other-repo");
      expect(typeof body.commits[0].branch).toBe("string");
    } finally {
      mock.stop();
    }
  });

  test("falls back to origin when --remote-url is empty", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "data");

      const startProc = cli(["session", "start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const endProc = cli(["session", "end", "--id", (await new Response(startProc.stdout).text()).trim()]);
      await endProc.exited;

      // Sync with empty remote URL (should fall back to origin)
      const syncProc = cli(["sync", "--remote-url", ""]);
      const exitCode = await syncProc.exited;

      expect(exitCode).toBe(0);
      expect(mock.requests).toHaveLength(1);

      const body = mock.requests[0].body as { commits: Array<{ org: string; repo: string }> };
      expect(body.commits[0].org).toBe("my-org");
      expect(body.commits[0].repo).toBe("my-repo");
    } finally {
      mock.stop();
    }
  });

  test("auto-closes stale open sessions before syncing", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "stale data");

      // Start a session and capture a commit
      const startProc = cli(["session", "start", "--agent", "pi", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      // Set the data file mtime to 2 hours ago so it looks stale
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(dataPath, twoHoursAgo, twoHoursAgo);

      // Sync -- the open session should be auto-closed and removed from pending
      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain("auto-closed stale session");
      expect(stderr).toContain(sessionId);

      // Session was auto-closed to "ended", so after successful sync it should be removed
      const pendingPath = join(tempDir, ".residue/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(0);

      // Verify the upload sent status "ended"
      expect(mock.requests).toHaveLength(1);
      const body = mock.requests[0].body as { session: { status: string } };
      expect(body.session.status).toBe("ended");
    } finally {
      mock.stop();
    }
  });

  test("does not auto-close recently active open sessions", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "fresh data");

      // Start a session and capture a commit -- data file mtime is now (fresh)
      const startProc = cli(["session", "start", "--agent", "pi", "--data", dataPath]);
      await startProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("auto-closed");

      // Open session stays in pending
      const pendingPath = join(tempDir, ".residue/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe("open");
    } finally {
      mock.stop();
    }
  });

  test("auto-closes open session when data file is missing", async () => {
    const mock = createMockServer();

    try {
      await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "data");

      const startProc = cli(["session", "start", "--agent", "pi", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      // Delete the data file
      await rm(dataPath);

      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain("auto-closed session");
      expect(stderr).toContain("not accessible");
      expect(stderr).toContain(sessionId);
    } finally {
      mock.stop();
    }
  });

  test("keeps session on upload failure", async () => {
    // Worker that returns 500 for upload-url
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("error", { status: 500 });
      },
    });

    try {
      await setupConfig({ workerUrl: `http://localhost:${server.port}`, token: "t" });

      const dataPath = join(tempDir, "session-data.jsonl");
      await writeFile(dataPath, "data");

      const startProc = cli(["session", "start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      // Capture while open so it gets a commit SHA
      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const endProc = cli(["session", "end", "--id", sessionId]);
      await endProc.exited;

      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain("upload failed");

      const pendingPath = join(tempDir, ".residue/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(1);
    } finally {
      server.stop();
    }
  });
});
