import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let tempDir: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-read-test-"));

	const git = (args: string[]) =>
		Bun.spawn(["git", ...args], {
			cwd: tempDir,
			stdout: "pipe",
			stderr: "pipe",
		});
	await git(["init"]).exited;
	await git(["config", "user.email", "test@test.com"]).exited;
	await git(["config", "user.name", "Test"]).exited;
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

function cli(args: string[]) {
	return Bun.spawn(["bun", entry, ...args], {
		cwd: tempDir,
		stdout: "pipe",
		stderr: "pipe",
	});
}

async function writePending(sessions: unknown[]) {
	const residueDir = join(tempDir, ".residue");
	await mkdir(residueDir, { recursive: true });
	await writeFile(
		join(residueDir, "pending.json"),
		JSON.stringify(sessions, null, 2),
	);
}

describe("read", () => {
	test("outputs session data file contents to stdout", async () => {
		const dataPath = join(tempDir, "session-data.jsonl");
		const content =
			'{"role":"human","content":"fix the bug"}\n{"role":"assistant","content":"on it"}\n';
		await writeFile(dataPath, content);

		await writePending([
			{
				id: "s-read-1",
				agent: "claude-code",
				agent_version: "1.0.0",
				status: "open",
				data_path: dataPath,
				commits: [],
			},
		]);

		const proc = cli(["read", "s-read-1"]);
		const code = await proc.exited;
		const stdout = await new Response(proc.stdout).text();

		expect(code).toBe(0);
		expect(stdout).toBe(content);
	});

	test("errors when session id is not found in pending", async () => {
		await writePending([]);

		const proc = cli(["read", "nonexistent-id"]);
		const code = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(code).toBe(1);
		expect(stderr).toContain("Session not found in local state");
		expect(stderr).toContain("nonexistent-id");
	});

	test("errors when data file does not exist on disk", async () => {
		await writePending([
			{
				id: "s-missing-file",
				agent: "pi",
				agent_version: "0.5.0",
				status: "ended",
				data_path: join(tempDir, "does-not-exist.jsonl"),
				commits: [],
			},
		]);

		const proc = cli(["read", "s-missing-file"]);
		const code = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(code).toBe(1);
		expect(stderr).toContain("Session data file not found");
		expect(stderr).toContain("does-not-exist.jsonl");
	});

	test("errors when not in a git repo", async () => {
		// Remove .git so it's no longer a repo
		await rm(join(tempDir, ".git"), { recursive: true, force: true });

		const proc = cli(["read", "some-id"]);
		const code = await proc.exited;

		expect(code).toBe(1);
	});

	test("outputs nothing to stderr on success (except debug)", async () => {
		const dataPath = join(tempDir, "data.jsonl");
		await writeFile(dataPath, "test content");

		await writePending([
			{
				id: "s-quiet",
				agent: "claude-code",
				agent_version: "1.0.0",
				status: "open",
				data_path: dataPath,
				commits: [],
			},
		]);

		const proc = cli(["read", "s-quiet"]);
		await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		const stdout = await new Response(proc.stdout).text();

		expect(stdout).toBe("test content");
		// stderr should be empty (debug output is suppressed by default)
		expect(stderr).toBe("");
	});
});
