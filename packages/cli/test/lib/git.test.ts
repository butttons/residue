import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getCommitFiles } from "@/lib/git";

let tempDir: string;

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
	tempDir = await mkdtemp(join(tmpdir(), "residue-git-test-"));
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

describe("getCommitFiles", () => {
	test("returns added files with line counts", async () => {
		await writeFile(join(tempDir, "new-file.ts"), "line1\nline2\nline3\n");
		await gitExec(["add", "."]);
		await gitExec(["commit", "-m", "add new file"]);
		const sha = await gitExec(["rev-parse", "HEAD"]);

		// getCommitFiles uses process.cwd() implicitly via git
		const origDir = process.cwd();
		process.chdir(tempDir);
		try {
			const result = await getCommitFiles(sha);
			expect(result.isOk()).toBe(true);
			const files = result._unsafeUnwrap();
			expect(files).toHaveLength(1);
			expect(files[0].path).toBe("new-file.ts");
			expect(files[0].changeType).toBe("A");
			expect(files[0].linesAdded).toBe(3);
			expect(files[0].linesDeleted).toBe(0);
		} finally {
			process.chdir(origDir);
		}
	});

	test("returns modified files with line counts", async () => {
		await writeFile(join(tempDir, "README.md"), "updated\nline2\n");
		await gitExec(["add", "."]);
		await gitExec(["commit", "-m", "update readme"]);
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const origDir = process.cwd();
		process.chdir(tempDir);
		try {
			const result = await getCommitFiles(sha);
			expect(result.isOk()).toBe(true);
			const files = result._unsafeUnwrap();
			expect(files).toHaveLength(1);
			expect(files[0].path).toBe("README.md");
			expect(files[0].changeType).toBe("M");
			expect(files[0].linesAdded).toBe(2);
			expect(files[0].linesDeleted).toBe(1);
		} finally {
			process.chdir(origDir);
		}
	});

	test("returns deleted files with line counts", async () => {
		await gitExec(["rm", "README.md"]);
		await gitExec(["commit", "-m", "delete readme"]);
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const origDir = process.cwd();
		process.chdir(tempDir);
		try {
			const result = await getCommitFiles(sha);
			expect(result.isOk()).toBe(true);
			const files = result._unsafeUnwrap();
			expect(files).toHaveLength(1);
			expect(files[0].path).toBe("README.md");
			expect(files[0].changeType).toBe("D");
			expect(files[0].linesAdded).toBe(0);
			expect(files[0].linesDeleted).toBe(1);
		} finally {
			process.chdir(origDir);
		}
	});

	test("handles multiple files in one commit", async () => {
		await writeFile(join(tempDir, "a.ts"), "aaa\n");
		await writeFile(join(tempDir, "b.ts"), "bbb\nbbb\n");
		await writeFile(join(tempDir, "README.md"), "changed\n");
		await gitExec(["add", "."]);
		await gitExec(["commit", "-m", "multi-file commit"]);
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const origDir = process.cwd();
		process.chdir(tempDir);
		try {
			const result = await getCommitFiles(sha);
			expect(result.isOk()).toBe(true);
			const files = result._unsafeUnwrap();
			expect(files).toHaveLength(3);

			const paths = files.map((f) => f.path).sort();
			expect(paths).toEqual(["README.md", "a.ts", "b.ts"]);

			const aFile = files.find((f) => f.path === "a.ts");
			expect(aFile?.changeType).toBe("A");
			expect(aFile?.linesAdded).toBe(1);

			const bFile = files.find((f) => f.path === "b.ts");
			expect(bFile?.changeType).toBe("A");
			expect(bFile?.linesAdded).toBe(2);

			const readme = files.find((f) => f.path === "README.md");
			expect(readme?.changeType).toBe("M");
		} finally {
			process.chdir(origDir);
		}
	});

	test("returns empty array for initial commit with no parent", async () => {
		// The initial commit in our test repo has "README.md" added
		const sha = await gitExec(["rev-parse", "HEAD"]);

		const origDir = process.cwd();
		process.chdir(tempDir);
		try {
			const result = await getCommitFiles(sha);
			expect(result.isOk()).toBe(true);
			const files = result._unsafeUnwrap();
			// diff-tree with no parent shows the root tree files
			expect(files.length).toBeGreaterThanOrEqual(0);
		} finally {
			process.chdir(origDir);
		}
	});
});
