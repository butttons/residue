import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "residue-init-test-"));
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

describe("init command", () => {
	test("creates hooks and .residue dir", async () => {
		const proc = cli(["init"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("Initialized residue");
		expect(stderr).toContain("post-commit: created");
		expect(stderr).toContain("pre-push: created");

		const postCommit = await readFile(
			join(tempDir, ".git/hooks/post-commit"),
			"utf-8",
		);
		expect(postCommit).toContain("residue capture");

		const prePush = await readFile(
			join(tempDir, ".git/hooks/pre-push"),
			"utf-8",
		);
		expect(prePush).toContain('residue sync --remote-url "$2"');

		// .residue dir should exist
		expect(existsSync(join(tempDir, ".residue"))).toBe(true);
	});

	test("adds .residue/ to .gitignore", async () => {
		const proc = cli(["init"], tempDir);
		await proc.exited;

		const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
		expect(gitignore).toContain(".residue/");
	});

	test("does not duplicate .residue/ in .gitignore on re-init", async () => {
		await cli(["init"], tempDir).exited;
		await cli(["init"], tempDir).exited;

		const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
		const count = gitignore.split(".residue/").length - 1;
		expect(count).toBe(1);
	});

	test("appends to existing .gitignore without clobbering", async () => {
		await writeFile(join(tempDir, ".gitignore"), "node_modules/\ndist/\n");

		const proc = cli(["init"], tempDir);
		await proc.exited;

		const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
		expect(gitignore).toContain("node_modules/");
		expect(gitignore).toContain("dist/");
		expect(gitignore).toContain(".residue/");
	});

	test("appends to existing hooks without duplicating", async () => {
		const hooksDir = join(tempDir, ".git/hooks");
		await mkdir(hooksDir, { recursive: true });
		await writeFile(
			join(hooksDir, "post-commit"),
			"#!/bin/sh\necho existing\n",
		);
		await chmod(join(hooksDir, "post-commit"), 0o755);

		const proc = cli(["init"], tempDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stderr).toContain("post-commit: appended");

		const content = await readFile(join(hooksDir, "post-commit"), "utf-8");
		expect(content).toContain("echo existing");
		expect(content).toContain("residue capture");

		// Run again -- should say already installed
		const proc2 = cli(["init"], tempDir);
		await proc2.exited;
		const stderr2 = await new Response(proc2.stderr).text();
		expect(stderr2).toContain("post-commit: already installed");
	});

	test("exits 1 when not in a git repo", async () => {
		const nonGitDir = await mkdtemp(join(tmpdir(), "residue-no-git-"));
		const proc = cli(["init"], nonGitDir);
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(1);
		expect(stderr).toContain("not a git repository");

		await rm(nonGitDir, { recursive: true, force: true });
	});
});
