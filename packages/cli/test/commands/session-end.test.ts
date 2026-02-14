import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { readPending } from "@/lib/pending";

let tempDir: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-session-end-test-"));
  const proc = Bun.spawn(["git", "init", tempDir], { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
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

describe("session-end command", () => {
  test("marks an open session as ended", async () => {
    // First create a session
    const startProc = cli(["session", "start", "--agent", "claude-code", "--data", "/tmp/session.jsonl"]);
    await startProc.exited;
    const sessionId = (await new Response(startProc.stdout).text()).trim();

    // End the session
    const endProc = cli(["session", "end", "--id", sessionId]);
    const exitCode = await endProc.exited;
    const stderr = await new Response(endProc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toContain(`Session ${sessionId} ended`);

    // Verify status changed
    const pendingPath = join(tempDir, ".git/ai-sessions/pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("ended");
  });

  test("exits 1 when session not found", async () => {
    const proc = cli(["session", "end", "--id", "nonexistent-id"]);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Session not found");
  });

  test("exits 1 when --id is missing", async () => {
    const proc = cli(["session", "end"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });
});
