import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { isGitRepo } from "@/lib/git";
import { getProjectRoot, getResidueDir } from "@/lib/pending";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("init");

import {
	appendFile,
	chmod,
	mkdir,
	readFile,
	stat,
	writeFile,
} from "fs/promises";
import { join } from "path";

const POST_COMMIT_LINE = "residue capture >/dev/null 2>&1";
const PRE_PUSH_LINE = 'residue sync --remote-url "$2"';

function installHook(opts: {
	hooksDir: string;
	filename: string;
	line: string;
}): ResultAsync<string, CliError> {
	const hookPath = join(opts.hooksDir, opts.filename);

	return ResultAsync.fromPromise(
		(async () => {
			let isExisting = false;
			try {
				await stat(hookPath);
				isExisting = true;
			} catch {
				// file does not exist
			}

			if (isExisting) {
				const content = await readFile(hookPath, "utf-8");
				if (content.includes(opts.line)) {
					return `${opts.filename}: already installed`;
				}
				await writeFile(hookPath, content.trimEnd() + "\n" + opts.line + "\n");
				await chmod(hookPath, 0o755);
				return `${opts.filename}: appended`;
			}

			await writeFile(hookPath, `#!/bin/sh\n${opts.line}\n`);
			await chmod(hookPath, 0o755);
			return `${opts.filename}: created`;
		})(),
		toCliError({
			message: `Failed to install hook ${opts.filename}`,
			code: "IO_ERROR",
		}),
	);
}

function getGitDirForInit(): ResultAsync<string, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			await proc.exited;
			return (await new Response(proc.stdout).text()).trim();
		})(),
		toCliError({ message: "Failed to get git directory", code: "GIT_ERROR" }),
	);
}

function ensureGitignore(projectRoot: string): ResultAsync<void, CliError> {
	const gitignorePath = join(projectRoot, ".gitignore");

	return ResultAsync.fromPromise(
		(async () => {
			let content = "";
			try {
				content = await readFile(gitignorePath, "utf-8");
			} catch {
				// file does not exist yet
			}

			if (content.includes(".residue")) {
				return;
			}

			const line =
				content.length > 0 && !content.endsWith("\n")
					? "\n.residue/\n"
					: ".residue/\n";
			await appendFile(gitignorePath, line);
		})(),
		toCliError({ message: "Failed to update .gitignore", code: "IO_ERROR" }),
	);
}

export function init(): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const isRepo = yield* isGitRepo();
		if (!isRepo) {
			return err(
				new CliError({ message: "not a git repository", code: "GIT_ERROR" }),
			);
		}

		const [projectRoot, gitDir] = yield* ResultAsync.combine([
			getProjectRoot(),
			getGitDirForInit(),
		]);

		const hooksDir = join(gitDir, "hooks");

		yield* ResultAsync.combine([
			getResidueDir(projectRoot),
			ResultAsync.fromPromise(
				mkdir(hooksDir, { recursive: true }),
				toCliError({
					message: "Failed to create hooks directory",
					code: "IO_ERROR",
				}),
			),
		]);

		const [postCommit, prePush] = yield* ResultAsync.combine([
			installHook({
				hooksDir,
				filename: "post-commit",
				line: POST_COMMIT_LINE,
			}),
			installHook({
				hooksDir,
				filename: "pre-push",
				line: PRE_PUSH_LINE,
			}),
			ensureGitignore(projectRoot),
		]);

		log.info("Initialized residue in this repository.");
		log.info(`  ${postCommit}`);
		log.info(`  ${prePush}`);
		return ok(undefined);
	});
}
