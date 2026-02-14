import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const INSTALL_SCRIPT = resolve(__dirname, "..", "install.ts");
const UNINSTALL_SCRIPT = resolve(__dirname, "..", "uninstall.ts");

describe("claude code adapter install", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "residue-cc-install-"));
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    settingsPath = join(claudeDir, "settings.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("installs hooks into empty settings", async () => {
    writeFileSync(settingsPath, "{}");

    const proc = Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.SessionEnd).toBeDefined();
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain(
      "hooks.sh"
    );
    expect(settings.hooks.SessionEnd[0].hooks[0].command).toContain(
      "hooks.sh"
    );
  });

  it("preserves existing hooks when installing", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        model: "opus",
        hooks: {
          PreCompact: [
            {
              matcher: "",
              hooks: [{ type: "command", command: "echo pre-compact" }],
            },
          ],
        },
      })
    );

    const proc = Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.model).toBe("opus");
    expect(settings.hooks.PreCompact).toBeDefined();
    expect(settings.hooks.PreCompact[0].hooks[0].command).toBe(
      "echo pre-compact"
    );
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.SessionEnd).toBeDefined();
  });

  it("does not duplicate hooks on re-install", async () => {
    writeFileSync(settingsPath, "{}");

    // Install twice
    Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
    });
    const proc = Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
    });

    expect(proc.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.SessionStart.length).toBe(1);
    expect(settings.hooks.SessionEnd.length).toBe(1);
  });

  it("creates settings file if it does not exist", async () => {
    // Don't create settings file

    const proc = Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode).toBe(0);
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.SessionStart).toBeDefined();
  });
});

describe("claude code adapter uninstall", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "residue-cc-uninstall-"));
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    settingsPath = join(claudeDir, "settings.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("removes residue hooks from settings", async () => {
    // First install
    writeFileSync(settingsPath, "{}");
    Bun.spawnSync(["bun", "run", INSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
    });

    // Then uninstall
    const proc = Bun.spawnSync(["bun", "run", UNINSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
    });

    expect(proc.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeUndefined();
  });

  it("preserves non-residue hooks when uninstalling", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [{ type: "command", command: "echo other-hook" }],
            },
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "bash /path/to/hooks.sh",
                },
              ],
            },
          ],
          PreCompact: [
            {
              matcher: "",
              hooks: [{ type: "command", command: "echo keep-me" }],
            },
          ],
        },
      })
    );

    const proc = Bun.spawnSync(["bun", "run", UNINSTALL_SCRIPT], {
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
    });

    expect(proc.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks.SessionStart.length).toBe(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(
      "echo other-hook"
    );
    expect(settings.hooks.PreCompact).toBeDefined();
  });
});
