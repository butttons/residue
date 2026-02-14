import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const HOOKS_SCRIPT = resolve(__dirname, "..", "hooks.sh");

type RunHookResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runHook(params: {
  input: Record<string, unknown>;
  env?: Record<string, string>;
}): Promise<RunHookResult> {
  const inputJson = JSON.stringify(params.input);
  const proc = Bun.spawn(["bash", HOOKS_SCRIPT], {
    stdin: new Blob([inputJson]),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...params.env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe("claude code adapter", () => {
  let tempDir: string;
  let fakeHome: string;
  let fakeBinDir: string;
  let residueCalls: string[];
  let residueCallsFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "residue-cc-test-"));
    fakeHome = join(tempDir, "home");
    fakeBinDir = join(tempDir, "bin");
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(fakeBinDir, { recursive: true });

    residueCalls = [];
    residueCallsFile = join(tempDir, "residue-calls.log");
    writeFileSync(residueCallsFile, "");

    // Create a fake residue binary that logs calls
    const fakeResidue = join(fakeBinDir, "residue");
    writeFileSync(
      fakeResidue,
      `#!/bin/sh
echo "$@" >> "${residueCallsFile}"
if echo "$@" | grep -q "session-start"; then
  echo "test-residue-session-id"
fi
exit 0
`
    );

    // Make it executable
    Bun.spawnSync(["chmod", "+x", fakeResidue]);

    // Create a fake claude binary for version detection
    const fakeClaude = join(fakeBinDir, "claude");
    writeFileSync(
      fakeClaude,
      `#!/bin/sh
echo "2.1.42"
`
    );
    Bun.spawnSync(["chmod", "+x", fakeClaude]);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function getResidueCallsLog(): string[] {
    if (!existsSync(residueCallsFile)) return [];
    return readFileSync(residueCallsFile, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean);
  }

  function hookEnv(): Record<string, string> {
    return {
      HOME: fakeHome,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
    };
  }

  it("calls residue session-start on SessionStart", async () => {
    const result = await runHook({
      input: {
        session_id: "cc-session-123",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-sonnet-4-5-20250929",
      },
      env: hookEnv(),
    });

    expect(result.exitCode).toBe(0);

    const calls = getResidueCallsLog();
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("session-start");
    expect(calls[0]).toContain("--agent claude-code");
    expect(calls[0]).toContain("--data /tmp/transcript.jsonl");
    expect(calls[0]).toContain("--agent-version 2.1.42");

    // Check state file was created
    const stateFile = join(
      fakeHome,
      ".residue",
      "claude-code",
      "cc-session-123.state"
    );
    expect(existsSync(stateFile)).toBe(true);
    expect(readFileSync(stateFile, "utf-8")).toBe("test-residue-session-id");
  });

  it("calls residue session-end on SessionEnd", async () => {
    // First start a session
    await runHook({
      input: {
        session_id: "cc-session-456",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
      },
      env: hookEnv(),
    });

    // Then end it
    const result = await runHook({
      input: {
        session_id: "cc-session-456",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionEnd",
      },
      env: hookEnv(),
    });

    expect(result.exitCode).toBe(0);

    const calls = getResidueCallsLog();
    expect(calls.length).toBe(2);
    expect(calls[1]).toContain("session-end");
    expect(calls[1]).toContain("--id test-residue-session-id");

    // State file should be removed
    const stateFile = join(
      fakeHome,
      ".residue",
      "claude-code",
      "cc-session-456.state"
    );
    expect(existsSync(stateFile)).toBe(false);
  });

  it("skips SessionStart on resume when state already exists", async () => {
    // Create a pre-existing state file (simulating a previous startup)
    const stateDir = join(fakeHome, ".residue", "claude-code");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, "cc-session-789.state"),
      "existing-residue-id"
    );

    const result = await runHook({
      input: {
        session_id: "cc-session-789",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "resume",
      },
      env: hookEnv(),
    });

    expect(result.exitCode).toBe(0);

    // Should not call residue again
    const calls = getResidueCallsLog();
    expect(calls.length).toBe(0);
  });

  it("exits cleanly when residue is not on PATH", async () => {
    const result = await runHook({
      input: {
        session_id: "cc-session-000",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
      },
      env: {
        HOME: fakeHome,
        PATH: "/usr/bin:/bin", // No fake bin dir
      },
    });

    expect(result.exitCode).toBe(0);
  });

  it("exits cleanly when transcript_path is empty", async () => {
    const result = await runHook({
      input: {
        session_id: "cc-session-empty",
        transcript_path: "",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
      },
      env: hookEnv(),
    });

    expect(result.exitCode).toBe(0);

    const calls = getResidueCallsLog();
    expect(calls.length).toBe(0);
  });

  it("handles SessionEnd without prior SessionStart gracefully", async () => {
    const result = await runHook({
      input: {
        session_id: "cc-session-no-start",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionEnd",
      },
      env: hookEnv(),
    });

    expect(result.exitCode).toBe(0);

    // No residue calls should be made
    const calls = getResidueCallsLog();
    expect(calls.length).toBe(0);
  });

  it("handles full lifecycle: start -> end", async () => {
    const sessionId = "cc-lifecycle-test";
    const env = hookEnv();

    // Start
    await runHook({
      input: {
        session_id: sessionId,
        transcript_path: "/home/user/.claude/projects/test/session.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-sonnet-4-5-20250929",
      },
      env,
    });

    // Verify state file exists
    const stateFile = join(
      fakeHome,
      ".residue",
      "claude-code",
      `${sessionId}.state`
    );
    expect(existsSync(stateFile)).toBe(true);

    // End
    await runHook({
      input: {
        session_id: sessionId,
        transcript_path: "/home/user/.claude/projects/test/session.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionEnd",
      },
      env,
    });

    // Verify state file cleaned up
    expect(existsSync(stateFile)).toBe(false);

    // Verify both residue calls
    const calls = getResidueCallsLog();
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("session-start");
    expect(calls[0]).toContain(
      "--data /home/user/.claude/projects/test/session.jsonl"
    );
    expect(calls[1]).toContain("session-end");
    expect(calls[1]).toContain("--id test-residue-session-id");
  });

  it("detects claude version for agent-version flag", async () => {
    // Overwrite fake claude with specific version
    const fakeClaude = join(fakeBinDir, "claude");
    writeFileSync(
      fakeClaude,
      `#!/bin/sh
echo "3.0.0-beta"
`
    );
    Bun.spawnSync(["chmod", "+x", fakeClaude]);

    await runHook({
      input: {
        session_id: "cc-version-test",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: "/home/user/project",
        hook_event_name: "SessionStart",
        source: "startup",
      },
      env: hookEnv(),
    });

    const calls = getResidueCallsLog();
    expect(calls[0]).toContain("--agent-version 3.0.0-beta");
  });
});
