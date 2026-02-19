import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readPending } from "@/lib/pending";

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
	return (await new Response(proc.stdout).text()).trim();
}

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-sync-test-"));
	fakeHome = await mkdtemp(join(tmpdir(), "residue-sync-home-"));
	await gitExec(["init"]);
	await gitExec(["config", "user.email", "test@test.com"]);
	await gitExec(["config", "user.name", "Test"]);
	await gitExec([
		"remote",
		"add",
		"origin",
		"git@github.com:my-org/my-repo.git",
	]);
	await writeFile(join(tempDir, "README.md"), "init");
	await gitExec(["add", "."]);
	await gitExec(["commit", "-m", "initial"]);
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
	await rm(fakeHome, { recursive: true, force: true });
});

function cli(args: string[], env?: Record<string, string>) {
	return Bun.spawn(["bun", entry, ...args], {
		cwd: tempDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, HOME: fakeHome, DEBUG: "residue:*", ...env },
	});
}

async function setupConfig(opts: { workerUrl: string; token: string }) {
	const configDir = join(fakeHome, ".residue");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config"),
		JSON.stringify({ worker_url: opts.workerUrl, token: opts.token }),
	);
}

type RequestLog = {
	method: string;
	url: string;
	body: unknown;
	auth: string | null;
};

type R2Upload = {
	key: string;
	body: string;
};

function createMockServer() {
	const requests: RequestLog[] = [];
	const r2Uploads: R2Upload[] = [];

	// Mock R2 endpoint that receives PUT requests (simulates presigned URL target)
	const r2Server = Bun.serve({
		port: 0,
		fetch(req) {
			return (async () => {
				if (req.method === "PUT") {
					const url = new URL(req.url);
					const body = await req.text();
					r2Uploads.push({ key: url.pathname, body });
					return new Response("", { status: 200 });
				}
				return new Response("method not allowed", { status: 405 });
			})();
		},
	});

	const r2BaseUrl = `http://localhost:${r2Server.port}`;

	// Worker mock that returns presigned URLs pointing to the mock R2
	const workerServer = Bun.serve({
		port: 0,
		fetch(req) {
			return (async () => {
				const url = new URL(req.url);

				if (url.pathname === "/api/sessions/upload-url") {
					const body = (await req.json()) as { session_id: string };
					const r2Key = `sessions/${body.session_id}.json`;

					requests.push({
						method: req.method,
						url: url.pathname,
						body,
						auth: req.headers.get("authorization"),
					});

					return new Response(
						JSON.stringify({
							url: `${r2BaseUrl}/${r2Key}`,
							r2_key: r2Key,
						}),
						{ status: 200 },
					);
				}

				if (url.pathname === "/api/sessions") {
					const body = await req.json();
					requests.push({
						method: req.method,
						url: url.pathname,
						body,
						auth: req.headers.get("authorization"),
					});
					return new Response(JSON.stringify({ ok: true }), { status: 200 });
				}

				return new Response("not found", { status: 404 });
			})();
		},
	});

	return {
		workerUrl: `http://localhost:${workerServer.port}`,
		requests,
		r2Uploads,
		stop() {
			workerServer.stop();
			r2Server.stop();
		},
	};
}

describe("sync command", () => {
	test("uploads data to R2 via presigned URL and posts metadata to worker", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "my-token" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, '{"role":"user","content":"hello"}');

			// Create a session, capture while open, then end it
			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;
			const sessionId = (await new Response(startProc.stdout).text()).trim();

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const endProc = cli(["session", "end", "--id", sessionId]);
			await endProc.exited;

			// Sync
			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;
			const stderr = await new Response(syncProc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stderr).toContain("uploaded session");
			expect(stderr).toContain("directly to R2");
			expect(stderr).toContain("synced session");
			expect(stderr).toContain(sessionId);

			// Should have 2 worker requests: upload-url + POST metadata
			expect(mock.requests).toHaveLength(2);
			expect(mock.requests[0].url).toBe("/api/sessions/upload-url");

			const req = mock.requests[1];
			expect(req.url).toBe("/api/sessions");
			expect(req.method).toBe("POST");
			expect(req.auth).toBe("Bearer my-token");

			const body = req.body as {
				session: Record<string, unknown>;
				commits: Array<Record<string, unknown>>;
			};
			expect(body.session.id).toBe(sessionId);
			expect(body.session.agent).toBe("claude-code");
			expect(body.session.status).toBe("ended");
			// Metadata POST must NOT contain inline data
			expect(body.session.data).toBeUndefined();
			expect(body.commits).toHaveLength(1);
			expect(body.commits[0].org).toBe("my-org");
			expect(body.commits[0].repo).toBe("my-repo");
			expect(typeof body.commits[0].branch).toBe("string");
			expect((body.commits[0].branch as string).length).toBeGreaterThan(0);

			// R2 should have received the data directly
			expect(mock.r2Uploads).toHaveLength(1);
			expect(mock.r2Uploads[0].body).toBe('{"role":"user","content":"hello"}');

			// Ended session removed from pending
			const pendingPath = join(tempDir, ".residue/pending.json");
			const sessions = (await readPending(pendingPath))._unsafeUnwrap();
			expect(sessions).toHaveLength(0);
		} finally {
			mock.stop();
		}
	});

	test("keeps open sessions in pending after sync", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "data");

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const syncProc = cli(["sync"]);
			await syncProc.exited;

			const pendingPath = join(tempDir, ".residue/pending.json");
			const sessions = (await readPending(pendingPath))._unsafeUnwrap();
			expect(sessions).toHaveLength(1);
			expect(sessions[0].status).toBe("open");
		} finally {
			mock.stop();
		}
	});

	test("uses --remote-url for org/repo inference when provided", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "data");

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const endProc = cli([
				"session",
				"end",
				"--id",
				(await new Response(startProc.stdout).text()).trim(),
			]);
			await endProc.exited;

			// Sync with a different remote URL (not origin)
			const syncProc = cli([
				"sync",
				"--remote-url",
				"git@github.com:other-org/other-repo.git",
			]);
			const exitCode = await syncProc.exited;

			expect(exitCode).toBe(0);
			expect(mock.requests).toHaveLength(2);

			const body = mock.requests[1].body as {
				commits: Array<{ org: string; repo: string; branch: string }>;
			};
			expect(body.commits[0].org).toBe("other-org");
			expect(body.commits[0].repo).toBe("other-repo");
			expect(typeof body.commits[0].branch).toBe("string");
		} finally {
			mock.stop();
		}
	});

	test("falls back to origin when --remote-url is empty", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "data");

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const endProc = cli([
				"session",
				"end",
				"--id",
				(await new Response(startProc.stdout).text()).trim(),
			]);
			await endProc.exited;

			// Sync with empty remote URL (should fall back to origin)
			const syncProc = cli(["sync", "--remote-url", ""]);
			const exitCode = await syncProc.exited;

			expect(exitCode).toBe(0);
			expect(mock.requests).toHaveLength(2);

			const body = mock.requests[1].body as {
				commits: Array<{ org: string; repo: string }>;
			};
			expect(body.commits[0].org).toBe("my-org");
			expect(body.commits[0].repo).toBe("my-repo");
		} finally {
			mock.stop();
		}
	});

	test("auto-closes stale open sessions before syncing", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "stale data");

			// Start a session and capture a commit
			const startProc = cli([
				"session",
				"start",
				"--agent",
				"pi",
				"--data",
				dataPath,
			]);
			await startProc.exited;
			const sessionId = (await new Response(startProc.stdout).text()).trim();

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			// Set the data file mtime to 2 hours ago so it looks stale
			const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
			await utimes(dataPath, twoHoursAgo, twoHoursAgo);

			// Sync -- the open session should be auto-closed and removed from pending
			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;
			const stderr = await new Response(syncProc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stderr).toContain("auto-closed stale session");
			expect(stderr).toContain(sessionId);

			// Session was auto-closed to "ended", so after successful sync it should be removed
			const pendingPath = join(tempDir, ".residue/pending.json");
			const sessions = (await readPending(pendingPath))._unsafeUnwrap();
			expect(sessions).toHaveLength(0);

			// Verify the upload sent status "ended"
			expect(mock.requests).toHaveLength(2);
			const body = mock.requests[1].body as { session: { status: string } };
			expect(body.session.status).toBe("ended");
		} finally {
			mock.stop();
		}
	});

	test("does not auto-close recently active open sessions", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "fresh data");

			// Start a session and capture a commit -- data file mtime is now (fresh)
			const startProc = cli([
				"session",
				"start",
				"--agent",
				"pi",
				"--data",
				dataPath,
			]);
			await startProc.exited;

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;
			const stderr = await new Response(syncProc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stderr).not.toContain("auto-closed");

			// Open session stays in pending
			const pendingPath = join(tempDir, ".residue/pending.json");
			const sessions = (await readPending(pendingPath))._unsafeUnwrap();
			expect(sessions).toHaveLength(1);
			expect(sessions[0].status).toBe("open");
		} finally {
			mock.stop();
		}
	});

	test("auto-closes open session when data file is missing", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "t" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "data");

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"pi",
				"--data",
				dataPath,
			]);
			await startProc.exited;
			const sessionId = (await new Response(startProc.stdout).text()).trim();

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			// Delete the data file
			await rm(dataPath);

			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;
			const stderr = await new Response(syncProc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stderr).toContain("auto-closed session");
			expect(stderr).toContain("not accessible");
			expect(stderr).toContain(sessionId);
		} finally {
			mock.stop();
		}
	});

	test("includes changed files in commit payload", async () => {
		const mock = createMockServer();

		try {
			await setupConfig({ workerUrl: mock.workerUrl, token: "my-token" });

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, '{"role":"user","content":"hello"}');

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;
			const sessionId = (await new Response(startProc.stdout).text()).trim();

			// Create a file and commit it
			await mkdir(join(tempDir, "src"), { recursive: true });
			await writeFile(
				join(tempDir, "src/auth.ts"),
				"export const auth = true;\n",
			);
			await gitExec(["add", "."]);
			await gitExec(["commit", "-m", "add auth module"]);

			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const endProc = cli(["session", "end", "--id", sessionId]);
			await endProc.exited;

			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;

			expect(exitCode).toBe(0);
			expect(mock.requests).toHaveLength(2);

			const body = mock.requests[1].body as {
				session: Record<string, unknown>;
				commits: Array<{
					sha: string;
					files: Array<{
						path: string;
						change_type: string;
						lines_added: number;
						lines_deleted: number;
					}>;
				}>;
			};

			expect(body.commits).toHaveLength(1);
			expect(body.commits[0].files).toBeDefined();
			expect(body.commits[0].files.length).toBeGreaterThan(0);

			const authFile = body.commits[0].files.find(
				(f) => f.path === "src/auth.ts",
			);
			expect(authFile).toBeDefined();
			expect(authFile!.change_type).toBe("A");
			expect(authFile!.lines_added).toBe(1);
			expect(authFile!.lines_deleted).toBe(0);
		} finally {
			mock.stop();
		}
	});

	test("keeps session on upload failure", async () => {
		// Worker that returns 500 for everything
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response("error", { status: 500 });
			},
		});

		try {
			await setupConfig({
				workerUrl: `http://localhost:${server.port}`,
				token: "t",
			});

			const dataPath = join(tempDir, "session-data.jsonl");
			await writeFile(dataPath, "data");

			const startProc = cli([
				"session",
				"start",
				"--agent",
				"claude-code",
				"--data",
				dataPath,
			]);
			await startProc.exited;
			const sessionId = (await new Response(startProc.stdout).text()).trim();

			// Capture while open so it gets a commit SHA
			const captureProc = cli(["capture"]);
			await captureProc.exited;

			const endProc = cli(["session", "end", "--id", sessionId]);
			await endProc.exited;

			const syncProc = cli(["sync"]);
			const exitCode = await syncProc.exited;
			const stderr = await new Response(syncProc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stderr).toContain("failed to get upload URL");

			const pendingPath = join(tempDir, ".residue/pending.json");
			const sessions = (await readPending(pendingPath))._unsafeUnwrap();
			expect(sessions).toHaveLength(1);
		} finally {
			server.stop();
		}
	});
});
