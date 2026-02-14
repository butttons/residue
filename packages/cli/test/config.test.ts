import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getConfigDir,
  getConfigPath,
  readConfig,
  writeConfig,
  configExists,
  type ResidueConfig,
} from "../src/lib/config";
import { join } from "path";
import { homedir } from "os";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

// We'll test against a temp dir by monkey-patching homedir
let originalHome: string;
let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "residue-test-"));
  originalHome = process.env.HOME!;
  process.env.HOME = tempHome;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  await rm(tempHome, { recursive: true, force: true });
});

describe("getConfigDir", () => {
  test("returns ~/.residue path", () => {
    const dir = getConfigDir();
    expect(dir).toBe(join(tempHome, ".residue"));
  });
});

describe("getConfigPath", () => {
  test("returns ~/.residue/config path", () => {
    const path = getConfigPath();
    expect(path).toBe(join(tempHome, ".residue", "config"));
  });
});

describe("readConfig", () => {
  test("returns null when config does not exist", async () => {
    const result = await readConfig();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
  });

  test("reads existing config", async () => {
    const config: ResidueConfig = {
      worker_url: "https://my-worker.dev",
      token: "secret-123",
    };
    await writeConfig(config);

    const result = await readConfig();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(config);
  });
});

describe("writeConfig", () => {
  test("creates config dir and writes file", async () => {
    const config: ResidueConfig = {
      worker_url: "https://example.com",
      token: "tok",
    };
    const result = await writeConfig(config);
    expect(result.isOk()).toBe(true);

    const file = Bun.file(getConfigPath());
    expect(await file.exists()).toBe(true);
    const parsed = JSON.parse(await file.text());
    expect(parsed).toEqual(config);
  });

  test("overwrites existing config", async () => {
    await writeConfig({ worker_url: "https://old.dev", token: "old" });
    await writeConfig({ worker_url: "https://new.dev", token: "new" });

    const result = await readConfig();
    expect(result._unsafeUnwrap()).toEqual({
      worker_url: "https://new.dev",
      token: "new",
    });
  });
});

describe("configExists", () => {
  test("returns false when no config", async () => {
    const result = await configExists();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(false);
  });

  test("returns true after writing config", async () => {
    await writeConfig({ worker_url: "https://x.dev", token: "t" });
    const result = await configExists();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
  });
});
