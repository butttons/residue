import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { readConfig } from "@/lib/config";

let originalHome: string;
let tempHome: string;
const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "residue-login-test-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tempHome;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  await rm(tempHome, { recursive: true, force: true });
});

function cli(args: string[]) {
  return Bun.spawn(["bun", entry, ...args], {
    cwd: cliDir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: tempHome },
  });
}

describe("login command", () => {
  test("saves config with valid url and token", async () => {
    const proc = cli(["login", "--url", "https://my-worker.dev", "--token", "secret-123"]);
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("Logged in to https://my-worker.dev");

    const config = (await readConfig())._unsafeUnwrap();
    expect(config).toEqual({ worker_url: "https://my-worker.dev", token: "secret-123" });
  });

  test("strips trailing slashes from url", async () => {
    const proc = cli(["login", "--url", "https://my-worker.dev///", "--token", "tok"]);
    await proc.exited;
    const config = (await readConfig())._unsafeUnwrap();
    expect(config!.worker_url).toBe("https://my-worker.dev");
  });

  test("exits 1 when url is missing", async () => {
    const proc = cli(["login", "--token", "tok"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  test("exits 1 when token is missing", async () => {
    const proc = cli(["login", "--url", "https://x.dev"]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  test("exits 1 for invalid url format", async () => {
    const proc = cli(["login", "--url", "ftp://bad.dev", "--token", "tok"]);
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("http://");
  });
});
