import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let tempDir: string;
let fakeHome: string;

const cliDir = join(import.meta.dir, "../..");
const entry = join(cliDir, "src/index.ts");

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-query-test-"));
	fakeHome = await mkdtemp(join(tmpdir(), "residue-query-home-"));

	// Init git repo so getProjectRoot works
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

async function setupConfig(opts: { workerUrl: string; token: string }) {
	const configDir = join(fakeHome, ".residue");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config"),
		JSON.stringify({ worker_url: opts.workerUrl, token: opts.token }),
	);
}

type RouteHandler = {
	method: string;
	path: string;
	response: unknown;
	status?: number;
};

function createMockServer(routes: RouteHandler[]) {
	const requests: { method: string; url: string }[] = [];

	const server = Bun.serve({
		port: 0,
		fetch(req) {
			const url = new URL(req.url);
			requests.push({ method: req.method, url: url.pathname + url.search });

			for (const route of routes) {
				if (req.method === route.method && url.pathname === route.path) {
					return new Response(JSON.stringify(route.response), {
						status: route.status ?? 200,
						headers: { "Content-Type": "application/json" },
					});
				}
			}

			return new Response("Not found", { status: 404 });
		},
	});

	return { server, requests };
}

describe("query sessions", () => {
	test("lists sessions in human-readable format", async () => {
		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/sessions",
				response: {
					sessions: [
						{
							id: "s-1",
							agent: "claude-code",
							agent_version: "1.0.0",
							created_at: 1700000000,
							ended_at: 1700003600,
							data_path: "/path/to/session.jsonl",
							first_message: "fix the auth bug",
							session_name: "fix-auth",
						},
					],
				},
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "sessions"]);
		await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(stderr).toContain("1 session(s)");
		expect(stderr).toContain("s-1");
		expect(stderr).toContain("claude-code");
		expect(stderr).toContain("fix-auth");
		expect(stderr).toContain("fix the auth bug");
		expect(stderr).toContain("/path/to/session.jsonl");

		server.stop();
	});

	test("outputs JSON to stdout with --json flag", async () => {
		const sessions = [
			{
				id: "s-json",
				agent: "pi",
				agent_version: "0.5.0",
				created_at: 1700000000,
				ended_at: null,
				data_path: null,
				first_message: null,
				session_name: null,
			},
		];

		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/sessions",
				response: { sessions },
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "sessions", "--json"]);
		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const parsed = JSON.parse(stdout);

		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe("s-json");
		expect(parsed[0].agent).toBe("pi");

		server.stop();
	});

	test("passes filter flags as query params", async () => {
		const { server, requests } = createMockServer([
			{
				method: "GET",
				path: "/api/query/sessions",
				response: { sessions: [] },
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli([
			"query",
			"sessions",
			"--agent",
			"pi",
			"--repo",
			"my-org/my-repo",
			"--branch",
			"main",
		]);
		await proc.exited;

		expect(requests.length).toBe(1);
		expect(requests[0].url).toContain("agent=pi");
		expect(requests[0].url).toContain("repo=my-org%2Fmy-repo");
		expect(requests[0].url).toContain("branch=main");

		server.stop();
	});
});

describe("query commits", () => {
	test("lists commits in human-readable format", async () => {
		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/commits",
				response: {
					commits: [
						{
							sha: "abc1234567890",
							message: "fix auth redirect",
							author: "jane",
							committed_at: 1700000000,
							branch: "main",
							org: "my-org",
							repo: "my-repo",
							session_ids: ["s-1", "s-2"],
						},
					],
				},
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "commits"]);
		await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(stderr).toContain("1 commit(s)");
		expect(stderr).toContain("abc1234");
		expect(stderr).toContain("fix auth redirect");
		expect(stderr).toContain("my-org/my-repo");
		expect(stderr).toContain("jane");
		expect(stderr).toContain("s-1, s-2");

		server.stop();
	});

	test("outputs JSON to stdout with --json flag", async () => {
		const commits = [
			{
				sha: "def456",
				message: "add feature",
				author: "bob",
				committed_at: 1700000000,
				branch: "feat",
				org: "o",
				repo: "r",
				session_ids: ["s-1"],
			},
		];

		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/commits",
				response: { commits },
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "commits", "--json"]);
		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const parsed = JSON.parse(stdout);

		expect(parsed).toHaveLength(1);
		expect(parsed[0].sha).toBe("def456");

		server.stop();
	});

	test("passes filter flags as query params", async () => {
		const { server, requests } = createMockServer([
			{
				method: "GET",
				path: "/api/query/commits",
				response: { commits: [] },
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli([
			"query",
			"commits",
			"--author",
			"alice",
			"--repo",
			"org/repo",
			"--branch",
			"dev",
		]);
		await proc.exited;

		expect(requests.length).toBe(1);
		expect(requests[0].url).toContain("author=alice");
		expect(requests[0].url).toContain("repo=org%2Frepo");
		expect(requests[0].url).toContain("branch=dev");

		server.stop();
	});
});

describe("query session <id>", () => {
	test("shows session detail with commits", async () => {
		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/sessions/s-detail-1",
				response: {
					session: {
						id: "s-detail-1",
						agent: "claude-code",
						agent_version: "1.2.3",
						created_at: 1700000000,
						ended_at: 1700003600,
						data_path: "/path/to/data.jsonl",
						first_message: "fix the auth redirect",
						session_name: "fix-auth-redirect",
					},
					commits: [
						{
							commit_sha: "abc123",
							message: "fix auth",
							author: "jane",
							committed_at: 1700000000,
							branch: "main",
							org: "my-org",
							repo: "my-repo",
						},
					],
				},
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "session", "s-detail-1"]);
		await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(stderr).toContain("Session s-detail-1");
		expect(stderr).toContain("claude-code");
		expect(stderr).toContain("fix-auth-redirect");
		expect(stderr).toContain("/path/to/data.jsonl");
		expect(stderr).toContain("abc123");
		expect(stderr).toContain("fix auth");
		expect(stderr).toContain("my-org/my-repo");

		server.stop();
	});

	test("outputs JSON with --json flag", async () => {
		const detail = {
			session: {
				id: "s-json-detail",
				agent: "pi",
				agent_version: "0.5.0",
				created_at: 1700000000,
				ended_at: null,
				data_path: null,
				first_message: null,
				session_name: null,
			},
			commits: [],
		};

		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/sessions/s-json-detail",
				response: detail,
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "session", "s-json-detail", "--json"]);
		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const parsed = JSON.parse(stdout);

		expect(parsed.session.id).toBe("s-json-detail");
		expect(parsed.commits).toEqual([]);

		server.stop();
	});
});

describe("query commit <sha>", () => {
	test("shows commit detail with linked sessions", async () => {
		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/commits/abc123",
				response: {
					commit_sha: "abc123",
					message: "fix auth redirect",
					author: "jane",
					committed_at: 1700000000,
					branch: "main",
					org: "my-org",
					repo: "my-repo",
					sessions: [
						{
							id: "s-1",
							agent: "claude-code",
							agent_version: "1.0.0",
							created_at: 1700000000,
							ended_at: 1700003600,
							data_path: "/path/session.jsonl",
							first_message: null,
							session_name: "my-session",
						},
					],
				},
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "commit", "abc123"]);
		await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(stderr).toContain("Commit abc123");
		expect(stderr).toContain("fix auth redirect");
		expect(stderr).toContain("my-org/my-repo");
		expect(stderr).toContain("jane");
		expect(stderr).toContain("1 session(s)");
		expect(stderr).toContain("s-1");
		expect(stderr).toContain("claude-code");
		expect(stderr).toContain("my-session");

		server.stop();
	});

	test("outputs JSON with --json flag", async () => {
		const detail = {
			commit_sha: "def456",
			message: "add feature",
			author: "bob",
			committed_at: 1700000000,
			branch: "feat",
			org: "o",
			repo: "r",
			sessions: [],
		};

		const { server } = createMockServer([
			{
				method: "GET",
				path: "/api/query/commits/def456",
				response: detail,
			},
		]);

		await setupConfig({
			workerUrl: `http://localhost:${server.port}`,
			token: "test-token",
		});

		const proc = cli(["query", "commit", "def456", "--json"]);
		await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const parsed = JSON.parse(stdout);

		expect(parsed.commit_sha).toBe("def456");
		expect(parsed.sessions).toEqual([]);

		server.stop();
	});
});

describe("query without config", () => {
	test("exits with error when not configured", async () => {
		const proc = cli(["query", "sessions"]);
		const code = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(code).toBe(1);
		expect(stderr).toContain("Not configured");

		// No config dir means no config
	});
});
