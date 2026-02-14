import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, readFile, writeFile, chmod, mkdir } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-init-test-"));
  // Init a bare git repo so init command works
  const proc = Bun.spawn(["git", "init", tempDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

function cli(args: string[], cwd: string) {
  return Bun.spawn(["bun", entry, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
}

describe("init command", () => {
  test("creates hooks and ai-sessions dir", async () => {
    const proc = cli(["init"], tempDir);
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialized residue");
    expect(stdout).toContain("post-commit: created");
    expect(stdout).toContain("pre-push: created");

    const postCommit = await readFile(join(tempDir, ".git/hooks/post-commit"), "utf-8");
    expect(postCommit).toContain("residue capture");

    const prePush = await readFile(join(tempDir, ".git/hooks/pre-push"), "utf-8");
    expect(prePush).toContain('residue sync --remote-url "$2"');

    // ai-sessions dir should exist
    const lsProc = Bun.spawn(["ls", join(tempDir, ".git/ai-sessions")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await lsProc.exited).toBe(0);
  });

  test("appends to existing hooks without duplicating", async () => {
    // Create existing post-commit hook
    const hooksDir = join(tempDir, ".git/hooks");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, "post-commit"), "#!/bin/sh\necho existing\n");
    await chmod(join(hooksDir, "post-commit"), 0o755);

    const proc = cli(["init"], tempDir);
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("post-commit: appended");

    const content = await readFile(join(hooksDir, "post-commit"), "utf-8");
    expect(content).toContain("echo existing");
    expect(content).toContain("residue capture");

    // Run again -- should say already installed
    const proc2 = cli(["init"], tempDir);
    await proc2.exited;
    const stdout2 = await new Response(proc2.stdout).text();
    expect(stdout2).toContain("post-commit: already installed");
  });

  test("exits 1 when not in a git repo", async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), "residue-no-git-"));
    const proc = cli(["init"], nonGitDir);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("not a git repository");

    await rm(nonGitDir, { recursive: true, force: true });
  });
});
