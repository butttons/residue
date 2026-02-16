import { readFile, stat } from "fs/promises";
import { ok, okAsync, ResultAsync, safeTry } from "neverthrow";
import { join } from "path";
import { readConfig, readLocalConfig } from "@/lib/config";
import { isGitRepo } from "@/lib/git";
import { getPendingPath, getProjectRoot, readPending } from "@/lib/pending";
import type { CliError } from "@/utils/errors";
import { toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("status");

function checkFileExists(path: string): ResultAsync<boolean, CliError> {
	return ResultAsync.fromPromise(
		stat(path).then(() => true),
		toCliError({ message: "Failed to check file", code: "IO_ERROR" }),
	).orElse(() => okAsync(false));
}

function checkHookInstalled(opts: {
	gitDir: string;
	hookName: string;
	needle: string;
}): ResultAsync<boolean, CliError> {
	const hookPath = join(opts.gitDir, "hooks", opts.hookName);
	return ResultAsync.fromPromise(
		readFile(hookPath, "utf-8").then((content) =>
			content.includes(opts.needle),
		),
		toCliError({ message: "Failed to read hook", code: "IO_ERROR" }),
	).orElse(() => okAsync(false));
}

function getGitDir(): ResultAsync<string, CliError> {
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

export function status(): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const isRepo = yield* isGitRepo();
		if (!isRepo) {
			log.info("Not a git repository.");
			return ok(undefined);
		}

		const projectRoot = yield* getProjectRoot();

		// -- Auth / Login state --
		log.info("Login");

		const globalConfig = yield* readConfig();
		if (globalConfig) {
			log.info(`  global: ${globalConfig.worker_url}`);
		} else {
			log.info("  global: not configured");
		}

		const localConfig = yield* readLocalConfig(projectRoot);
		if (localConfig) {
			log.info(`  local:  ${localConfig.worker_url}`);
		} else {
			log.info("  local:  not configured");
		}

		const isActiveConfig = localConfig ?? globalConfig;
		if (isActiveConfig) {
			log.info(`  active: ${isActiveConfig.worker_url}`);
		} else {
			log.info('  active: none (run "residue login" to configure)');
		}

		log.info("");

		// -- Git hooks --
		log.info("Hooks");

		const gitDir = yield* getGitDir();

		const isPostCommitInstalled = yield* checkHookInstalled({
			gitDir,
			hookName: "post-commit",
			needle: "residue capture",
		});
		log.info(
			`  post-commit: ${isPostCommitInstalled ? "installed" : "not installed"}`,
		);

		const isPrePushInstalled = yield* checkHookInstalled({
			gitDir,
			hookName: "pre-push",
			needle: "residue sync",
		});
		log.info(
			`  pre-push:    ${isPrePushInstalled ? "installed" : "not installed"}`,
		);

		if (!isPostCommitInstalled || !isPrePushInstalled) {
			log.info('  run "residue init" to install missing hooks');
		}

		log.info("");

		// -- Agent adapters --
		log.info("Adapters");

		const isClaudeSetup = yield* checkFileExists(
			join(projectRoot, ".claude", "settings.json"),
		);

		let isClaudeHookConfigured = false;
		if (isClaudeSetup) {
			isClaudeHookConfigured = yield* ResultAsync.fromPromise(
				readFile(join(projectRoot, ".claude", "settings.json"), "utf-8").then(
					(content) => content.includes("residue hook claude-code"),
				),
				toCliError({
					message: "Failed to read claude settings",
					code: "IO_ERROR",
				}),
			).orElse(() => okAsync(false));
		}

		log.info(
			`  claude-code: ${isClaudeHookConfigured ? "configured" : "not configured"}`,
		);

		const isPiSetup = yield* checkFileExists(
			join(projectRoot, ".pi", "extensions", "residue.ts"),
		);
		log.info(`  pi:          ${isPiSetup ? "configured" : "not configured"}`);

		log.info("");

		// -- Pending sessions --
		log.info("Sessions");

		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		if (sessions.length === 0) {
			log.info("  no pending sessions");
		} else {
			const openSessions = sessions.filter((s) => s.status === "open");
			const endedSessions = sessions.filter((s) => s.status === "ended");
			const totalCommits = sessions.reduce(
				(sum, s) => sum + s.commits.length,
				0,
			);
			const sessionsWithCommits = sessions.filter((s) => s.commits.length > 0);

			log.info(`  total:   ${sessions.length}`);
			log.info(`  open:    ${openSessions.length}`);
			log.info(`  ended:   ${endedSessions.length}`);
			log.info(
				`  commits: ${totalCommits} across ${sessionsWithCommits.length} session(s)`,
			);

			const isReadyToSync = sessionsWithCommits.length > 0;
			if (isReadyToSync) {
				log.info(
					`  ${sessionsWithCommits.length} session(s) ready to sync on next push`,
				);
			} else {
				log.info("  no sessions ready to sync (no commits captured yet)");
			}
		}

		return ok(undefined);
	});
}
