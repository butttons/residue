import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { readPending } from "@/lib/pending";

let tempDir: string;

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
  tempDir = await mkdtemp(join(tmpdir(), "residue-capture-test-"));
  await gitExec(["init"]);
  await gitExec(["config", "user.email", "test@test.com"]);
  await gitExec(["config", "user.name", "Test"]);
  // Create initial commit so HEAD exists
  await writeFile(join(tempDir, "README.md"), "init");
  await gitExec(["add", "."]);
  await gitExec(["commit", "-m", "initial"]);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function cli(args: string[]) {
  return Bun.spawn(["bun", entry, ...args], {
    cwd: tempDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
}

describe("capture command", () => {
  test("tags pending sessions with current commit SHA", async () => {
    // Create a session
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s.jsonl"]);
    await startProc.exited;
    const sessionId = (await new Response(startProc.stdout).text()).trim();

    // Make a new commit so there's a new SHA to capture
    await writeFile(join(tempDir, "file.txt"), "hello");
    await gitExec(["add", "."]);
    await gitExec(["commit", "-m", "test commit"]);
    const sha = await gitExec(["rev-parse", "HEAD"]);

    // Run capture
    const captureProc = cli(["capture"]);
    const exitCode = await captureProc.exited;

    expect(exitCode).toBe(0);

    // Verify SHA was added
    const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].commits).toContain(sha);
  });

  test("does not duplicate SHA on repeated capture", async () => {
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s.jsonl"]);
    await startProc.exited;

    // Capture twice on same commit
    const c1 = cli(["capture"]);
    await c1.exited;
    const c2 = cli(["capture"]);
    await c2.exited;

    const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    // Should have exactly 1 SHA (the initial commit), not duplicated
    const sha = await gitExec(["rev-parse", "HEAD"]);
    const count = sessions[0].commits.filter((c: string) => c === sha).length;
    expect(count).toBe(1);
  });

  test("tags both open and ended sessions", async () => {
    // Create two sessions
    const s1 = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s1.jsonl"]);
    await s1.exited;
    const id1 = (await new Response(s1.stdout).text()).trim();

    const s2 = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s2.jsonl"]);
    await s2.exited;

    // End the first session
    const endProc = cli(["session", "end", "--id", id1]);
    await endProc.exited;

    // Capture
    const captureProc = cli(["capture"]);
    await captureProc.exited;

    const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    const sha = await gitExec(["rev-parse", "HEAD"]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].commits).toContain(sha);
    expect(sessions[1].commits).toContain(sha);
  });

  test("exits 0 even with no pending sessions", async () => {
    const proc = cli(["capture"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
