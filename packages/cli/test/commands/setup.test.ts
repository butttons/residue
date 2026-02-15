import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-setup-test-"));
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

describe("setup claude-code", () => {
	test("creates .claude/settings.json with hooks", async () => {
		const proc = cli(["setup", "claude-code"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Configured Claude Code hooks");

		const settingsPath = join(tempDir, ".claude", "settings.json");
		expect(existsSync(settingsPath)).toBe(true);

		const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
		expect(settings.hooks.SessionStart).toBeDefined();
		expect(settings.hooks.SessionEnd).toBeDefined();

		const startHook = settings.hooks.SessionStart[0];
		expect(startHook.matcher).toBe("startup");
		expect(startHook.hooks[0].command).toBe("residue hook claude-code");
		expect(startHook.hooks[0].type).toBe("command");
		expect(startHook.hooks[0].timeout).toBe(10);

		const endHook = settings.hooks.SessionEnd[0];
		expect(endHook.matcher).toBe("");
		expect(endHook.hooks[0].command).toBe("residue hook claude-code");
	});

	test("merges hooks into existing .claude/settings.json", async () => {
		const claudeDir = join(tempDir, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(
			join(claudeDir, "settings.json"),
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
			}),
		);

		const proc = cli(["setup", "claude-code"], tempDir);
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);

		const settings = JSON.parse(
			await readFile(join(claudeDir, "settings.json"), "utf-8"),
		);
		expect(settings.model).toBe("opus");
		expect(settings.hooks.PreCompact).toBeDefined();
		expect(settings.hooks.PreCompact[0].hooks[0].command).toBe(
			"echo pre-compact",
		);
		expect(settings.hooks.SessionStart).toBeDefined();
		expect(settings.hooks.SessionEnd).toBeDefined();
	});

	test("is idempotent -- does not duplicate hooks", async () => {
		await cli(["setup", "claude-code"], tempDir).exited;
		const proc = cli(["setup", "claude-code"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("already configured");

		const settings = JSON.parse(
			await readFile(join(tempDir, ".claude", "settings.json"), "utf-8"),
		);
		expect(settings.hooks.SessionStart.length).toBe(1);
		expect(settings.hooks.SessionEnd.length).toBe(1);
	});

	test("handles malformed existing settings.json", async () => {
		const claudeDir = join(tempDir, ".claude");
		await mkdir(claudeDir, { recursive: true });
		await writeFile(join(claudeDir, "settings.json"), "not valid json{{{");

		const proc = cli(["setup", "claude-code"], tempDir);
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);

		const settings = JSON.parse(
			await readFile(join(claudeDir, "settings.json"), "utf-8"),
		);
		expect(settings.hooks.SessionStart).toBeDefined();
		expect(settings.hooks.SessionEnd).toBeDefined();
	});
});

describe("setup pi", () => {
	test("copies extension to .pi/extensions/residue.ts", async () => {
		const proc = cli(["setup", "pi"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Installed pi extension");

		const extensionPath = join(tempDir, ".pi", "extensions", "residue.ts");
		expect(existsSync(extensionPath)).toBe(true);

		const content = await readFile(extensionPath, "utf-8");
		expect(content).toContain("ExtensionAPI");
		expect(content).toContain("residue");
	});

	test("is idempotent -- does not overwrite existing extension", async () => {
		await cli(["setup", "pi"], tempDir).exited;

		const proc = cli(["setup", "pi"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("already exists");
	});
});

describe("setup unknown agent", () => {
	test("exits 1 for unknown agent", async () => {
		const proc = cli(["setup", "unknown-agent"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unknown agent");
	});
});
