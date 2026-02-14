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
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s.jsonl"]);
    await startProc.exited;

    await writeFile(join(tempDir, "file.txt"), "hello");
    await gitExec(["add", "."]);
    await gitExec(["commit", "-m", "test commit"]);
    const sha = await gitExec(["rev-parse", "HEAD"]);

    const captureProc = cli(["capture"]);
    const exitCode = await captureProc.exited;

    expect(exitCode).toBe(0);

    const pendingPath = join(tempDir, ".residue/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].commits.some((c) => c.sha === sha)).toBe(true);
    expect(sessions[0].commits[0].branch).toBeDefined();
  });

  test("does not duplicate SHA on repeated capture", async () => {
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s.jsonl"]);
    await startProc.exited;

    const c1 = cli(["capture"]);
    await c1.exited;
    const c2 = cli(["capture"]);
    await c2.exited;

    const pendingPath = join(tempDir, ".residue/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    const sha = await gitExec(["rev-parse", "HEAD"]);
    const count = sessions[0].commits.filter((c) => c.sha === sha).length;
    expect(count).toBe(1);
  });

  test("tags both open and ended sessions", async () => {
    const s1 = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s1.jsonl"]);
    await s1.exited;
    const id1 = (await new Response(s1.stdout).text()).trim();

    const s2 = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s2.jsonl"]);
    await s2.exited;

    const endProc = cli(["session", "end", "--id", id1]);
    await endProc.exited;

    await writeFile(join(tempDir, "file.txt"), "hello");
    await gitExec(["add", "."]);
    await gitExec(["commit", "-m", "test commit"]);
    const sha = await gitExec(["rev-parse", "HEAD"]);

    const captureProc = cli(["capture"]);
    await captureProc.exited;

    const pendingPath = join(tempDir, ".residue/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();

    expect(sessions).toHaveLength(2);
    const ended = sessions.find((s: { id: string }) => s.id === id1);
    expect(ended!.commits.some((c) => c.sha === sha)).toBe(true);
    const open = sessions.find((s: { id: string }) => s.id !== id1);
    expect(open!.commits.some((c) => c.sha === sha)).toBe(true);
  });

  test("records branch name with commit SHA", async () => {
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/s.jsonl"]);
    await startProc.exited;

    const captureProc = cli(["capture"]);
    await captureProc.exited;

    const pendingPath = join(tempDir, ".residue/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    const branch = sessions[0].commits[0].branch;
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).not.toBe("unknown");
  });

  test("exits 0 even with no pending sessions", async () => {
    const proc = cli(["capture"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
