import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { readPending } from "@/lib/pending";

let tempDir: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-hook-test-"));
  const proc = Bun.spawn(["git", "init", tempDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function cli(opts: { args: string[]; stdin: string; cwd: string }) {
  return Bun.spawn(["bun", entry, ...opts.args], {
    cwd: opts.cwd,
    stdin: new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
}

function hookInput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    session_id: "cc-session-123",
    transcript_path: "/tmp/transcript.jsonl",
    cwd: tempDir,
    hook_event_name: "SessionStart",
    source: "startup",
    ...overrides,
  });
}

describe("hook claude-code", () => {
  test("creates a session on SessionStart with source=startup", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput(),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Session started for claude-code");

    // Check pending session was created
    const pendingPath = join(tempDir, ".residue", "pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].agent).toBe("claude-code");
    expect(sessions[0].status).toBe("open");
    expect(sessions[0].data_path).toBe("/tmp/transcript.jsonl");

    // Check state file was created
    const stateFile = join(
      tempDir,
      ".residue",
      "hooks",
      "cc-session-123.state"
    );
    expect(existsSync(stateFile)).toBe(true);
    const residueId = await readFile(stateFile, "utf-8");
    expect(residueId).toBe(sessions[0].id);
  });

  test("skips SessionStart when source is resume", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ source: "resume" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const pendingPath = join(tempDir, ".residue", "pending.json");
    expect(existsSync(pendingPath)).toBe(false);
  });

  test("skips SessionStart when source is compact", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ source: "compact" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const pendingPath = join(tempDir, ".residue", "pending.json");
    expect(existsSync(pendingPath)).toBe(false);
  });

  test("skips SessionStart when transcript_path is missing", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ transcript_path: "" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const pendingPath = join(tempDir, ".residue", "pending.json");
    expect(existsSync(pendingPath)).toBe(false);
  });

  test("ends a session on SessionEnd", async () => {
    // First start a session
    const startProc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput(),
      cwd: tempDir,
    });
    await startProc.exited;

    // Then end it
    const endProc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ hook_event_name: "SessionEnd" }),
      cwd: tempDir,
    });
    const exitCode = await endProc.exited;
    const stderr = await new Response(endProc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toContain("ended");

    // Check session is now ended
    const pendingPath = join(tempDir, ".residue", "pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("ended");

    // State file should be removed
    const stateFile = join(
      tempDir,
      ".residue",
      "hooks",
      "cc-session-123.state"
    );
    expect(existsSync(stateFile)).toBe(false);
  });

  test("handles SessionEnd without prior SessionStart gracefully", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ hook_event_name: "SessionEnd" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    // No pending sessions should be created
    const pendingPath = join(tempDir, ".residue", "pending.json");
    expect(existsSync(pendingPath)).toBe(false);
  });

  test("handles full lifecycle: start -> end", async () => {
    const sessionId = "cc-lifecycle-test";

    // Start
    const startProc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ session_id: sessionId }),
      cwd: tempDir,
    });
    await startProc.exited;

    // Verify state file exists
    const stateFile = join(
      tempDir,
      ".residue",
      "hooks",
      `${sessionId}.state`
    );
    expect(existsSync(stateFile)).toBe(true);

    // End
    const endProc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({
        session_id: sessionId,
        hook_event_name: "SessionEnd",
      }),
      cwd: tempDir,
    });
    await endProc.exited;

    // State file should be cleaned up
    expect(existsSync(stateFile)).toBe(false);

    // Session should be ended
    const pendingPath = join(tempDir, ".residue", "pending.json");
    const sessions = (await readPending(pendingPath))._unsafeUnwrap();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("ended");
    expect(sessions[0].data_path).toBe("/tmp/transcript.jsonl");
  });

  test("exits 0 on unknown hook event", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ hook_event_name: "PreToolUse" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
  });

  test("exits 0 on malformed JSON input", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: "not valid json{{{",
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
  });

  test("stores state files in .residue/hooks/", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ session_id: "my-unique-session" }),
      cwd: tempDir,
    });
    await proc.exited;

    const stateFile = join(
      tempDir,
      ".residue",
      "hooks",
      "my-unique-session.state"
    );
    expect(existsSync(stateFile)).toBe(true);
  });

  test("skips SessionStart when source is clear", async () => {
    const proc = cli({
      args: ["hook", "claude-code"],
      stdin: hookInput({ source: "clear" }),
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const pendingPath = join(tempDir, ".residue", "pending.json");
    expect(existsSync(pendingPath)).toBe(false);
  });
});
