import { deriveSessionId } from "@residue/adapter/shared";
import { ok, okAsync, Result, ResultAsync, safeTry } from "neverthrow";
import {
	addSession,
	getPendingPath,
	getProjectRoot,
	getSession,
	readPending,
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

function fileExists(path: string): ResultAsync<boolean, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			try {
				await stat(path);
				return true;
			} catch {
				return false;
			}
		})(),
		toCliError({
			message: "Failed to check file existence",
			code: "IO_ERROR",
		}),
	);
}

function readFileContent(path: string): ResultAsync<string, CliError> {
	return ResultAsync.fromPromise(
		readFile(path, "utf-8"),
		toCliError({ message: "Failed to read file", code: "IO_ERROR" }),
	);
}

function handleSessionStart(opts: {
	input: ClaudeHookInput;
	projectRoot: string;
}): ResultAsync<void, CliError> {
	const { input, projectRoot } = opts;

	if (input.source !== "startup") return okAsync(undefined);
	if (!input.transcript_path) return okAsync(undefined);
	if (!input.session_id) return okAsync(undefined);

	const claudeSessionId = input.session_id;

	return safeTry(async function* () {
		const pendingPath = yield* getPendingPath(projectRoot);

		// Derive a deterministic ID from the transcript path so the
		// same Claude session file always maps to the same residue session.
		const residueSessionId = deriveSessionId(input.transcript_path!);

		const sessions = yield* readPending(pendingPath);
		const existing = sessions.find((s) => s.id === residueSessionId);

		if (existing) {
			if (existing.status === "ended") {
				yield* updateSession({
					path: pendingPath,
					id: existing.id,
					updates: { status: "open" },
				});
			}
		} else {
			yield* addSession({
				path: pendingPath,
				session: {
					id: residueSessionId,
					agent: "claude-code",
					agent_version: "unknown",
					status: "open",
					data_path: input.transcript_path!,
					commits: [],
				},
			});

			const version = yield* detectClaudeVersion();

			yield* updateSession({
				path: pendingPath,
				id: residueSessionId,
				updates: { agent_version: version },
			});
		}

		const hooksDir = yield* getHooksDir(projectRoot);
		const stateFile = join(hooksDir, `${claudeSessionId}.state`);

		yield* ResultAsync.fromPromise(
			writeFile(stateFile, residueSessionId),
			toCliError({
				message: "Failed to write hook state file",
				code: "IO_ERROR",
			}),
		);

		log.debug("session started for claude-code");
		return ok(undefined);
	});
}

function handleSessionEnd(opts: {
	input: ClaudeHookInput;
	projectRoot: string;
}): ResultAsync<void, CliError> {
	const { input, projectRoot } = opts;
	const claudeSessionId = input.session_id;

	if (!claudeSessionId) return okAsync(undefined);

	return safeTry(async function* () {
		const hooksDir = yield* getHooksDir(projectRoot);
		const stateFile = join(hooksDir, `${claudeSessionId}.state`);

		const isExists = yield* fileExists(stateFile);
		if (!isExists) return ok(undefined);

		const rawId = yield* readFileContent(stateFile);
		const trimmedId = rawId.trim();
		if (!trimmedId) return ok(undefined);

		const pendingPath = yield* getPendingPath(projectRoot);
		const session = yield* getSession({ path: pendingPath, id: trimmedId });

		if (session) {
			yield* updateSession({
				path: pendingPath,
				id: trimmedId,
				updates: { status: "ended" },
			});
		}

		yield* ResultAsync.fromPromise(
			rm(stateFile, { force: true }),
			toCliError({
				message: "Failed to remove hook state file",
				code: "IO_ERROR",
			}),
		);

		log.debug("session %s ended", trimmedId);
		return ok(undefined);
	});
}

export function hookClaudeCode(): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const raw = yield* readStdin();
		const input = yield* parseInput(raw);
		const projectRoot = yield* getProjectRoot();

		switch (input.hook_event_name) {
			case "SessionStart":
				yield* handleSessionStart({ input, projectRoot });
				break;
			case "SessionEnd":
				yield* handleSessionEnd({ input, projectRoot });
				break;
		}

		return ok(undefined);
	});
}
