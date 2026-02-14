import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
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
    env: { ...process.env, HOME: fakeHome, ...env },
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
  let r2Port: number;

  // R2 mock (accepts PUT uploads)
  const r2Server = Bun.serve({
    port: 0,
    fetch(req) {
      return (async () => {
        requests.push({
          method: req.method,
          url: new URL(req.url).pathname,
          body: await req.text(),
          auth: null,
        });
        return new Response("", { status: 200 });
      })();
    },
  });
  r2Port = r2Server.port;

  // Worker mock
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

        if (url.pathname === "/api/sessions/upload-url") {
          return new Response(
            JSON.stringify({ url: `http://localhost:${r2Port}/sessions/${(body as { session_id: string }).session_id}.json` }),
            { status: 200 }
          );
        }

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
      r2Server.stop();
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

      // Create and end a session
      const startProc = cli(["session-start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      const endProc = cli(["session-end", "--id", sessionId]);
      await endProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      // Sync
      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain(`Synced session ${sessionId}`);

      // Should have 3 requests: upload-url, R2 PUT, metadata POST
      expect(mock.requests).toHaveLength(3);

      // 1. Upload URL request
      const uploadUrlReq = mock.requests[0];
      expect(uploadUrlReq.url).toBe("/api/sessions/upload-url");
      expect(uploadUrlReq.auth).toBe("Bearer my-token");

      // 2. R2 PUT
      const r2Req = mock.requests[1];
      expect(r2Req.method).toBe("PUT");
      expect(r2Req.body).toBe('{"role":"user","content":"hello"}');

      // 3. Metadata POST (no data field)
      const metaReq = mock.requests[2];
      expect(metaReq.url).toBe("/api/sessions");
      const metaBody = metaReq.body as { session: Record<string, unknown>; commits: Array<Record<string, unknown>> };
      expect(metaBody.session.id).toBe(sessionId);
      expect(metaBody.session.agent).toBe("claude-code");
      expect(metaBody.session.status).toBe("ended");
      expect(metaBody.session).not.toHaveProperty("data");
      expect(metaBody.commits).toHaveLength(1);
      expect(metaBody.commits[0].org).toBe("my-org");
      expect(metaBody.commits[0].repo).toBe("my-repo");

      // Ended session removed from pending
      const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
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

      const startProc = cli(["session-start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const syncProc = cli(["sync"]);
      await syncProc.exited;

      const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe("open");
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

      const startProc = cli(["session-start", "--agent", "claude-code", "--data", dataPath]);
      await startProc.exited;
      const sessionId = (await new Response(startProc.stdout).text()).trim();

      const endProc = cli(["session-end", "--id", sessionId]);
      await endProc.exited;

      const captureProc = cli(["capture"]);
      await captureProc.exited;

      const syncProc = cli(["sync"]);
      const exitCode = await syncProc.exited;
      const stderr = await new Response(syncProc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stderr).toContain("Failed to get upload URL");

      const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
      const sessions = (await readPending(pendingPath))._unsafeUnwrap();
      expect(sessions).toHaveLength(1);
    } finally {
      server.stop();
    }
  });
});
