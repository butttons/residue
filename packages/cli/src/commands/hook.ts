import { okAsync, Result, ResultAsync } from "neverthrow";
import {
	addSession,
	getPendingPath,
	getProjectRoot,
	getSession,
	updateSession,
} from "@/lib/pending";
import { type CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("hook");

import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";

type ClaudeHookInput = {
	session_id: string;
	transcript_path?: string;
	cwd?: string;
	hook_event_name: string;
	source?: string;
	[key: string]: unknown;
};

function readStdin(): ResultAsync<string, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const chunks: Uint8Array[] = [];
			const reader = Bun.stdin.stream().getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			return Buffer.concat(chunks).toString("utf-8");
		})(),
		toCliError({ message: "Failed to read stdin", code: "IO_ERROR" }),
	);
}

function parseInput(raw: string): Result<ClaudeHookInput, CliError> {
	return Result.fromThrowable(
		(input: string) => JSON.parse(input) as ClaudeHookInput,
		toCliError({
			message: "Failed to parse hook input JSON",
			code: "PARSE_ERROR",
		}),
	)(raw);
}

function detectClaudeVersion(): ResultAsync<string, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const proc = Bun.spawn(["claude", "--version"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			if (exitCode !== 0) return "unknown";
			const output = await new Response(proc.stdout).text();
			return output.trim() || "unknown";
		})(),
		toCliError({
			message: "Failed to detect Claude version",
			code: "IO_ERROR",
		}),
	).orElse(() => okAsync("unknown"));
}

function getHooksDir(projectRoot: string): ResultAsync<string, CliError> {
	const hooksDir = join(projectRoot, ".residue", "hooks");
	return ResultAsync.fromPromise(
		(async () => {
			await mkdir(hooksDir, { recursive: true });
			return hooksDir;
		})(),
		toCliError({
			message: "Failed to create hooks state directory",
			code: "IO_ERROR",
		}),
	);
}

function handleSessionStart(opts: {
	input: ClaudeHookInput;
	projectRoot: string;
}): ResultAsync<void, CliError> {
	const { input, projectRoot } = opts;

	// Only track new sessions (source=startup)
	if (input.source !== "startup") {
		return okAsync(undefined);
	}

	// Skip if transcript_path is missing or empty
	if (!input.transcript_path) {
		return okAsync(undefined);
	}

	const claudeSessionId = input.session_id;
	if (!claudeSessionId) {
		return okAsync(undefined);
	}

	const residueSessionId = crypto.randomUUID();

	return getPendingPath(projectRoot)
		.andThen((pendingPath) =>
			addSession({
				path: pendingPath,
				session: {
					id: residueSessionId,
					agent: "claude-code",
					agent_version: "unknown",
					status: "open",
					data_path: input.transcript_path!,
					commits: [],
				},
			}),
		)
		.andThen(() => detectClaudeVersion())
		.andThen((version) =>
			// Update agent_version after detecting it
			getPendingPath(projectRoot).andThen((pendingPath) =>
				updateSession({
					path: pendingPath,
					id: residueSessionId,
					updates: { agent_version: version },
				}),
			),
		)
		.andThen(() => getHooksDir(projectRoot))
		.andThen((hooksDir) => {
			const stateFile = join(hooksDir, `${claudeSessionId}.state`);
			return ResultAsync.fromPromise(
				writeFile(stateFile, residueSessionId),
				toCliError({
					message: "Failed to write hook state file",
					code: "IO_ERROR",
				}),
			);
		})
		.map(() => {
			log.debug("session started for claude-code");
		});
}

function handleSessionEnd(opts: {
	input: ClaudeHookInput;
	projectRoot: string;
}): ResultAsync<void, CliError> {
	const { input, projectRoot } = opts;
	const claudeSessionId = input.session_id;

	if (!claudeSessionId) {
		return okAsync(undefined);
	}

	return getHooksDir(projectRoot).andThen((hooksDir) => {
		const stateFile = join(hooksDir, `${claudeSessionId}.state`);

		return ResultAsync.fromPromise(
			(async () => {
				let isExists = false;
				try {
					await stat(stateFile);
					isExists = true;
				} catch {
					// state file does not exist
				}
				return isExists;
			})(),
			toCliError({
				message: "Failed to check hook state file",
				code: "IO_ERROR",
			}),
		).andThen((isExists) => {
			if (!isExists) {
				// No state file means we never tracked this session (e.g. resumed)
				return okAsync(undefined);
			}

			return ResultAsync.fromPromise(
				readFile(stateFile, "utf-8"),
				toCliError({
					message: "Failed to read hook state file",
					code: "IO_ERROR",
				}),
			).andThen((residueSessionId) => {
				const trimmedId = residueSessionId.trim();
				if (!trimmedId) {
					return okAsync(undefined);
				}

				return getPendingPath(projectRoot)
					.andThen((pendingPath) =>
						getSession({ path: pendingPath, id: trimmedId }).andThen(
							(session) => {
								if (!session) {
									// Session was already removed (e.g. synced)
									return okAsync(undefined);
								}
								return updateSession({
									path: pendingPath,
									id: trimmedId,
									updates: { status: "ended" },
								});
							},
						),
					)
					.andThen(() =>
						ResultAsync.fromPromise(
							rm(stateFile, { force: true }),
							toCliError({
								message: "Failed to remove hook state file",
								code: "IO_ERROR",
							}),
						),
					)
					.map(() => {
						log.debug("session %s ended", trimmedId);
					});
			});
		});
	});
}

export function hookClaudeCode(): ResultAsync<void, CliError> {
	return readStdin()
		.andThen(parseInput)
		.andThen((input) =>
			getProjectRoot().andThen((projectRoot) => {
				switch (input.hook_event_name) {
					case "SessionStart":
						return handleSessionStart({ input, projectRoot });
					case "SessionEnd":
						return handleSessionEnd({ input, projectRoot });
					default:
						// Unknown hook events are silently ignored
						return okAsync(undefined);
				}
			}),
		);
}
