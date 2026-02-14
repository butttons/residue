import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Integration tests for the Claude Code adapter.
 * Tests the `residue hook claude-code` CLI command which replaced hooks.sh.
 */

const cliEntry = join(import.meta.dir, "..", "..", "..", "cli", "src", "index.ts");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-cc-adapter-test-"));
  const proc = Bun.spawn(["git", "init", tempDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function runHook(opts: { input: Record<string, unknown>; cwd: string }) {
  const inputJson = JSON.stringify(opts.input);
  return Bun.spawn(["bun", cliEntry, "hook", "claude-code"], {
    cwd: opts.cwd,
    stdin: new Blob([inputJson]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
}

async function readPendingSessions(projectRoot: string) {
  const pendingPath = join(projectRoot, ".residue", "pending.json");
  if (!existsSync(pendingPath)) return [];
  const raw = await readFile(pendingPath, "utf-8");
  return JSON.parse(raw);
}

describe("claude code adapter", () => {
  it("creates a session on SessionStart with source=startup", async () => {
    const proc = runHook({
      input: {
        session_id: "cc-session-123",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-sonnet-4-5-20250929",
      },
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const sessions = await readPendingSessions(tempDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0].agent).toBe("claude-code");
    expect(sessions[0].status).toBe("open");
    expect(sessions[0].data_path).toBe("/tmp/transcript.jsonl");

    // State file should exist in project-local .residue/hooks/
    const stateFile = join(tempDir, ".residue", "hooks", "cc-session-123.state");
    expect(existsSync(stateFile)).toBe(true);
    const residueId = await readFile(stateFile, "utf-8");
    expect(residueId).toBe(sessions[0].id);
  });

  it("ends a session on SessionEnd", async () => {
    // Start first
    await runHook({
      input: {
        session_id: "cc-session-456",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
      },
      cwd: tempDir,
    }).exited;

    // Then end
    const proc = runHook({
      input: {
        session_id: "cc-session-456",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      },
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const sessions = await readPendingSessions(tempDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe("ended");

    // State file should be removed
    const stateFile = join(tempDir, ".residue", "hooks", "cc-session-456.state");
    expect(existsSync(stateFile)).toBe(false);
  });

  it("skips SessionStart on resume", async () => {
    const proc = runHook({
      input: {
        session_id: "cc-session-789",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "resume",
      },
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const sessions = await readPendingSessions(tempDir);
    expect(sessions.length).toBe(0);
  });

  it("exits cleanly when transcript_path is empty", async () => {
    const proc = runHook({
      input: {
        session_id: "cc-session-empty",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
      },
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const sessions = await readPendingSessions(tempDir);
    expect(sessions.length).toBe(0);
  });

  it("handles SessionEnd without prior SessionStart gracefully", async () => {
    const proc = runHook({
      input: {
        session_id: "cc-session-no-start",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      },
      cwd: tempDir,
    });
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
  });

  it("handles full lifecycle: start -> end", async () => {
    const sessionId = "cc-lifecycle-test";

    // Start
    await runHook({
      input: {
        session_id: sessionId,
        transcript_path: "/home/user/.claude/projects/test/session.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-sonnet-4-5-20250929",
      },
      cwd: tempDir,
    }).exited;

    // Verify state file exists
    const stateFile = join(tempDir, ".residue", "hooks", `${sessionId}.state`);
    expect(existsSync(stateFile)).toBe(true);

    // End
    await runHook({
      input: {
        session_id: sessionId,
        transcript_path: "/home/user/.claude/projects/test/session.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      },
      cwd: tempDir,
    }).exited;

    // Verify state file cleaned up
    expect(existsSync(stateFile)).toBe(false);

    // Verify session is ended in pending queue
    const sessions = await readPendingSessions(tempDir);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe("ended");
    expect(sessions[0].data_path).toBe("/home/user/.claude/projects/test/session.jsonl");
  });

  it("never exits non-zero", async () => {
    // Malformed JSON
    const proc = Bun.spawn(["bun", cliEntry, "hook", "claude-code"], {
      cwd: tempDir,
      stdin: new Blob(["not valid json{{{"]),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
