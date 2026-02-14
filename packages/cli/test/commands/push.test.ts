import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";

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
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "residue-push-test-"));
  fakeHome = await mkdtemp(join(tmpdir(), "residue-push-home-"));
  await gitExec(["init"]);
  await gitExec(["config", "user.email", "test@test.com"]);
  await gitExec(["config", "user.name", "Test"]);
  await writeFile(join(tempDir, "README.md"), "init");
  await gitExec(["add", "."]);
  await gitExec(["commit", "-m", "initial"]);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(fakeHome, { recursive: true, force: true });
});

function cli(args: string[]) {
  return Bun.spawn(["bun", entry, ...args], {
    cwd: tempDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: fakeHome },
  });
}

describe("push command", () => {
  test("exits 1 when not configured", async () => {
    const proc = cli(["push"]);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not configured");
  });

  test("exits 0 when no pending sessions", async () => {
    const configDir = join(fakeHome, ".residue");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config"),
      JSON.stringify({ worker_url: "http://localhost:9999", token: "t" })
    );

    const proc = cli(["push"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
