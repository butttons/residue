import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseBranchFromRefs, parseSessionStartTime } from "@/commands/doctor";
import { readPending } from "@/lib/pending";

let tempDir: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

async function gitExec(
	args: string[],
	opts?: { env?: Record<string, string> },
) {
	const proc = Bun.spawn(["git", ...args], {
		cwd: tempDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...opts?.env },
	});
	await proc.exited;
	return (await new Response(proc.stdout).text()).trim();
}

/**
 * Create a git commit with both author and committer dates set to the same value.
 * git log --since/--until filters by committer date, and %ct reads committer date,
 * so both must be set for tests with backdated commits.
 */
async function gitCommitAt(opts: { message: string; dateIso: string }) {
	await gitExec(["commit", "-m", opts.message, "--date", opts.dateIso], {
		env: { GIT_COMMITTER_DATE: opts.dateIso },
	});
}

function cli(args: string[]) {
	return Bun.spawn(["bun", entry, ...args], {
		cwd: tempDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env },
	});
}

/**
 * Create a session data file with a timestamp-encoded filename.
 * The timestamp is formatted the same way pi writes session files:
 * YYYY-MM-DDTHH-MM-SS-mmmZ_<uuid>.jsonl
 */
function makeSessionFilename(opts: { date: Date; uuid: string }): string {
	const d = opts.date;
	const pad2 = (n: number) => String(n).padStart(2, "0");
	const pad3 = (n: number) => String(n).padStart(3, "0");
	const ts = [
		d.getUTCFullYear(),
		"-",
		pad2(d.getUTCMonth() + 1),
		"-",
		pad2(d.getUTCDate()),
		"T",
		pad2(d.getUTCHours()),
		"-",
		pad2(d.getUTCMinutes()),
		"-",
		pad2(d.getUTCSeconds()),
		"-",
		pad3(d.getUTCMilliseconds()),
		"Z",
	].join("");
	return `${ts}_${opts.uuid}.jsonl`;
}

/**
 * Set file mtime to a specific UTC time using touch.
 * Format for touch -t: YYYYMMDDhhmm.ss
 */
async function setMtimeUtc(opts: {
	filePath: string;
	date: Date;
}): Promise<void> {
	const d = opts.date;
	const pad2 = (n: number) => String(n).padStart(2, "0");
	const touchTime = [
		d.getUTCFullYear(),
		pad2(d.getUTCMonth() + 1),
		pad2(d.getUTCDate()),
		pad2(d.getUTCHours()),
		pad2(d.getUTCMinutes()),
		".",
		pad2(d.getUTCSeconds()),
	].join("");
	await Bun.spawn(["touch", "-t", touchTime, opts.filePath], {
		env: { ...process.env, TZ: "UTC" },
	}).exited;
}

async function ensureResidueDir(): Promise<string> {
	const pendingPath = join(tempDir, ".residue", "pending.json");
	await Bun.spawn(["mkdir", "-p", join(tempDir, ".residue")]).exited;
	return pendingPath;
}

// -- Unit tests for pure functions --

describe("parseSessionStartTime", () => {
	test("parses timestamp from standard pi session filename", () => {
		const path =
			"/Users/test/.pi/sessions/2026-02-20T06-27-18-861Z_b88e50bd-ff6b-44f3-b590-e69f91f14318.jsonl";
		const result = parseSessionStartTime(path);
		expect(result).toBe(new Date("2026-02-20T06:27:18.861Z").getTime());
	});

	test("returns null for unparseable filename", () => {
		expect(parseSessionStartTime("/some/random/file.txt")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseSessionStartTime("")).toBeNull();
	});

	test("handles filename without directory prefix", () => {
		const result = parseSessionStartTime(
			"2025-01-15T14-30-00-000Z_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
		);
		expect(result).toBe(new Date("2025-01-15T14:30:00.000Z").getTime());
	});
});

describe("parseBranchFromRefs", () => {
	test("extracts branch from HEAD -> ref", () => {
		expect(parseBranchFromRefs("HEAD -> main, origin/main")).toBe("main");
	});

	test("extracts branch from HEAD -> feature branch", () => {
		expect(
			parseBranchFromRefs("HEAD -> feat/installer, origin/feat/installer"),
		).toBe("feat/installer");
	});

	test("falls back to remote branch when no local ref", () => {
		expect(parseBranchFromRefs("origin/feat/v0.0.8")).toBe("feat/v0.0.8");
	});

	test("returns unknown for empty string", () => {
		expect(parseBranchFromRefs("")).toBe("unknown");
	});

	test("returns unknown for whitespace-only", () => {
		expect(parseBranchFromRefs("   ")).toBe("unknown");
	});

	test("prefers local branch over remote", () => {
		expect(parseBranchFromRefs("main, origin/main")).toBe("main");
	});

	test("ignores tag refs", () => {
		expect(parseBranchFromRefs("tag: v1.0.0, origin/main")).toBe("main");
	});
});

// -- Integration tests --

describe("doctor command", () => {
	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "residue-doctor-test-"));
		await gitExec(["init"]);
		await gitExec(["config", "user.email", "test@test.com"]);
		await gitExec(["config", "user.name", "Test"]);
		await writeFile(join(tempDir, "README.md"), "init");
		await gitExec(["add", "."]);
		await gitExec(["commit", "-m", "initial"]);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("exits cleanly when no orphaned sessions exist", async () => {
		const startProc = cli([
			"session",
			"start",
			"--agent",
			"pi",
			"--data",
			"/tmp/s.jsonl",
		]);
		await startProc.exited;

		const cap = cli(["capture"]);
		await cap.exited;

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("No orphaned sessions found");
	});

	test("links orphaned session to commit by timestamp", async () => {
		// Session starts at 10:00, ends at 10:10
		const sessionTime = new Date("2026-01-15T10:00:00.000Z");
		const sessionFilename = makeSessionFilename({
			date: sessionTime,
			uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		});
		const sessionDataPath = join(tempDir, sessionFilename);
		await writeFile(sessionDataPath, '{"test": true}');
		await setMtimeUtc({
			filePath: sessionDataPath,
			date: new Date("2026-01-15T10:10:00.000Z"),
		});

		// Commit at 10:05 (inside the session window)
		await writeFile(join(tempDir, "file.txt"), "hello");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "test commit",
			dateIso: "2026-01-15T10:05:00Z",
		});
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "test-session-1",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: sessionDataPath,
					commits: [],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Tagged 1 session(s)");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].commits.length).toBeGreaterThan(0);
		expect(sessions[0].commits.some((c) => c.sha === sha)).toBe(true);
	});

	test("does not link commits outside the session window", async () => {
		// Session window: 10:00 - 10:10
		const sessionTime = new Date("2026-01-15T10:00:00.000Z");
		const sessionFilename = makeSessionFilename({
			date: sessionTime,
			uuid: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
		});
		const sessionDataPath = join(tempDir, sessionFilename);
		await writeFile(sessionDataPath, '{"test": true}');
		await setMtimeUtc({
			filePath: sessionDataPath,
			date: new Date("2026-01-15T10:10:00.000Z"),
		});

		// Commit BEFORE the session window (09:00)
		await writeFile(join(tempDir, "early.txt"), "early");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "early commit",
			dateIso: "2026-01-15T09:00:00Z",
		});

		// Commit AFTER the session window (11:00)
		await writeFile(join(tempDir, "late.txt"), "late");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "late commit",
			dateIso: "2026-01-15T11:00:00Z",
		});

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "test-session-2",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: sessionDataPath,
					commits: [],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("no matching commits");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].commits).toHaveLength(0);
	});

	test("skips sessions with missing data files", async () => {
		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "test-session-missing",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path:
						"/nonexistent/2026-01-15T10-00-00-000Z_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl",
					commits: [],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Skipped 1 session(s) with missing data files");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].commits).toHaveLength(0);
	});

	test("does not modify sessions that already have commits", async () => {
		const sessionTime = new Date("2026-01-15T10:00:00.000Z");
		const sessionFilename = makeSessionFilename({
			date: sessionTime,
			uuid: "cccccccc-dddd-eeee-ffff-111111111111",
		});
		const sessionDataPath = join(tempDir, sessionFilename);
		await writeFile(sessionDataPath, '{"test": true}');
		await setMtimeUtc({
			filePath: sessionDataPath,
			date: new Date("2026-01-15T10:10:00.000Z"),
		});

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "already-tagged",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: sessionDataPath,
					commits: [{ sha: "abc123", branch: "main" }],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("No orphaned sessions found");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].commits).toHaveLength(1);
		expect(sessions[0].commits[0].sha).toBe("abc123");
	});

	test("is idempotent -- second run does not re-tag", async () => {
		const sessionTime = new Date("2026-01-15T10:00:00.000Z");
		const sessionFilename = makeSessionFilename({
			date: sessionTime,
			uuid: "dddddddd-eeee-ffff-1111-222222222222",
		});
		const sessionDataPath = join(tempDir, sessionFilename);
		await writeFile(sessionDataPath, '{"test": true}');
		await setMtimeUtc({
			filePath: sessionDataPath,
			date: new Date("2026-01-15T10:10:00.000Z"),
		});

		// Commit in the session window (10:05)
		await writeFile(join(tempDir, "file.txt"), "hello");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "in-window commit",
			dateIso: "2026-01-15T10:05:00Z",
		});
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "idempotent-test",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: sessionDataPath,
					commits: [],
				},
			]),
		);

		// First run
		const d1 = cli(["doctor"]);
		await d1.exited;

		const sessionsAfterFirst = (await readPending(pendingPath))._unsafeUnwrap();
		const commitsAfterFirst = sessionsAfterFirst[0].commits.length;
		expect(commitsAfterFirst).toBeGreaterThan(0);

		// Second run
		const d2 = cli(["doctor"]);
		await d2.exited;
		const stderr2 = await new Response(d2.stderr).text();

		const sessionsAfterSecond = (
			await readPending(pendingPath)
		)._unsafeUnwrap();

		expect(stderr2).toContain("No orphaned sessions found");
		expect(sessionsAfterSecond[0].commits.length).toBe(commitsAfterFirst);
		expect(sessionsAfterSecond[0].commits.some((c) => c.sha === sha)).toBe(
			true,
		);
	});

	test("uses file birthtime as start when filename has no timestamp", async () => {
		// Simulate a claude-code style data path (UUID only, no timestamp).
		// Since we cannot control birthtime (it is set by the OS at file creation),
		// we create the file, then set mtime far in the future, and make a commit
		// with a date 30 seconds from now. The window is [birthtime (~now), mtime (future)],
		// and the commit at now+30s should land inside it.
		const sessionDataPath = join(tempDir, "uuid-session-file.jsonl");
		await writeFile(sessionDataPath, '{"test": true}');

		// Set mtime to 1 hour from now
		const futureEnd = new Date(Date.now() + 60 * 60 * 1000);
		await setMtimeUtc({ filePath: sessionDataPath, date: futureEnd });

		// Commit with timestamp = 30 seconds from now (safely after birthtime, before mtime)
		const commitDate = new Date(Date.now() + 30 * 1000);
		await writeFile(join(tempDir, "file.txt"), "data");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "commit during session",
			dateIso: commitDate.toISOString(),
		});

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "claude-session-1",
					agent: "claude-code",
					agent_version: "1.0.0",
					status: "ended",
					data_path: sessionDataPath,
					commits: [],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		// Should NOT say "Cannot parse start time" -- it uses birthtime fallback
		expect(stderr).not.toContain("Cannot parse start time");
		// Should process the session (birthtime fallback worked)
		expect(stderr).toContain("Session claude-s");
		// Should find the commit in the window
		expect(stderr).toContain("Tagged 1 session(s)");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();
		expect(sessions[0].commits.length).toBeGreaterThan(0);
	});

	test("links multiple sessions to different commits", async () => {
		// Session 1: 10:00 - 10:10
		const s1Time = new Date("2026-01-15T10:00:00.000Z");
		const s1Filename = makeSessionFilename({
			date: s1Time,
			uuid: "11111111-2222-3333-4444-555555555555",
		});
		const s1Path = join(tempDir, s1Filename);
		await writeFile(s1Path, '{"session": 1}');
		await setMtimeUtc({
			filePath: s1Path,
			date: new Date("2026-01-15T10:10:00.000Z"),
		});

		// Session 2: 11:00 - 11:10
		const s2Time = new Date("2026-01-15T11:00:00.000Z");
		const s2Filename = makeSessionFilename({
			date: s2Time,
			uuid: "66666666-7777-8888-9999-aaaaaaaaaaaa",
		});
		const s2Path = join(tempDir, s2Filename);
		await writeFile(s2Path, '{"session": 2}');
		await setMtimeUtc({
			filePath: s2Path,
			date: new Date("2026-01-15T11:10:00.000Z"),
		});

		// Commit in session 1 window (10:05)
		await writeFile(join(tempDir, "file1.txt"), "one");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "commit in s1",
			dateIso: "2026-01-15T10:05:00Z",
		});
		const sha1 = await gitExec(["rev-parse", "HEAD"]);

		// Commit in session 2 window (11:05)
		await writeFile(join(tempDir, "file2.txt"), "two");
		await gitExec(["add", "."]);
		await gitCommitAt({
			message: "commit in s2",
			dateIso: "2026-01-15T11:05:00Z",
		});
		const sha2 = await gitExec(["rev-parse", "HEAD"]);

		const pendingPath = await ensureResidueDir();
		await writeFile(
			pendingPath,
			JSON.stringify([
				{
					id: "session-1",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: s1Path,
					commits: [],
				},
				{
					id: "session-2",
					agent: "pi",
					agent_version: "0.54.0",
					status: "ended",
					data_path: s2Path,
					commits: [],
				},
			]),
		);

		const doctorProc = cli(["doctor"]);
		const exitCode = await doctorProc.exited;
		const stderr = await new Response(doctorProc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Tagged 2 session(s)");

		const sessions = (await readPending(pendingPath))._unsafeUnwrap();

		const s1 = sessions.find((s) => s.id === "session-1");
		const s2 = sessions.find((s) => s.id === "session-2");

		// Session 1 gets commit 1 only
		expect(s1!.commits.some((c) => c.sha === sha1)).toBe(true);
		expect(s1!.commits.some((c) => c.sha === sha2)).toBe(false);

		// Session 2 gets commit 2 only
		expect(s2!.commits.some((c) => c.sha === sha2)).toBe(true);
		expect(s2!.commits.some((c) => c.sha === sha1)).toBe(false);
	});
});
