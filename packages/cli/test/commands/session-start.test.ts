import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readPending } from "@/lib/pending";

let tempDir: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-session-start-test-"));
	const proc = Bun.spawn(["git", "init", tempDir], {
		stdout: "pipe",
		stderr: "pipe",
	});
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
		env: { ...process.env, DEBUG: "residue:*" },
	});
}

describe("session-start command", () => {
	test("creates session and outputs UUID to stdout", async () => {
		const proc = cli([
			"session",
			"start",
			"--agent",
			"claude-code",
			"--data",
			"/tmp/session.jsonl",
		]);
		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		expect(stderr).toContain("session started");

		const pendingPath = join(tempDir, ".residue/pending.json");
		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].agent).toBe("claude-code");
		expect(sessions[0].agent_version).toBe("unknown");
		expect(sessions[0].status).toBe("open");
		expect(sessions[0].data_path).toBe("/tmp/session.jsonl");
		expect(sessions[0].id).toBe(stdout.trim());
	});

	test("accepts --version flag", async () => {
		const proc = cli([
			"session",
			"start",
			"--agent",
			"claude-code",
			"--data",
			"/tmp/s.jsonl",
			"--agent-version",
			"1.2.3",
		]);
		await proc.exited;

		const pendingPath = join(tempDir, ".residue/pending.json");
		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].agent_version).toBe("1.2.3");
	});

	test("exits 1 when --agent is missing", async () => {
		const proc = cli(["session", "start", "--data", "/tmp/s.jsonl"]);
		const exitCode = await proc.exited;
		expect(exitCode).toBe(1);
	});

	test("exits 1 when --data is missing", async () => {
		const proc = cli(["session", "start", "--agent", "claude-code"]);
		const exitCode = await proc.exited;
		expect(exitCode).toBe(1);
	});
});
