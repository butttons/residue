/**
 * Pending queue management for the residue CLI.
 * Manages .residue/pending.json in the project root.
 */

import { mkdir } from "fs/promises";
import { errAsync, ResultAsync } from "neverthrow";
import { join } from "path";
import { CliError, toCliError } from "@/utils/errors";

export type CommitRef = {
	sha: string;
	branch: string;
};

export type PendingSession = {
	id: string;
	agent: string;
	agent_version: string;
	status: "open" | "ended";
	data_path: string;
	commits: CommitRef[];
};

/**
 * Get the project root via git rev-parse --show-toplevel.
 */
export function getProjectRoot(): ResultAsync<string, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				throw new Error("not a git repository");
			}
			return (await new Response(proc.stdout).text()).trim();
		})(),
		toCliError({ message: "Not a git repository", code: "GIT_ERROR" }),
	);
}

/**
 * Get the .residue directory path, creating it if needed.
 */
export function getResidueDir(
	projectRoot: string,
): ResultAsync<string, CliError> {
	const residueDir = join(projectRoot, ".residue");
	return ResultAsync.fromPromise(
		(async () => {
			await mkdir(residueDir, { recursive: true });
			return residueDir;
		})(),
		toCliError({
			message: "Failed to create .residue directory",
			code: "IO_ERROR",
		}),
	);
}

/**
 * Get the path to .residue/pending.json, creating the directory if needed.
 */
export function getPendingPath(
	projectRoot: string,
): ResultAsync<string, CliError> {
	return getResidueDir(projectRoot).map((residueDir) =>
		join(residueDir, "pending.json"),
	);
}

/**
 * Migrate old format where commits was string[] to CommitRef[].
 */
function migratePending(sessions: PendingSession[]): PendingSession[] {
	for (const session of sessions) {
		if (session.commits.length > 0 && typeof session.commits[0] === "string") {
			session.commits = (session.commits as unknown as string[]).map((sha) => ({
				sha,
				branch: "unknown",
			}));
		}
	}
	return sessions;
}

/**
 * Read pending sessions from disk. Returns [] if file doesn't exist.
 * Handles backward compat: old format had commits as string[] (just SHAs).
 */
export function readPending(
	pendingPath: string,
): ResultAsync<PendingSession[], CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const file = Bun.file(pendingPath);
			const isExists = await file.exists();
			if (!isExists) return [];
			const text = await file.text();
			const sessions = JSON.parse(text) as PendingSession[];
			return migratePending(sessions);
		})(),
		toCliError({
			message: "Failed to read pending queue",
			code: "STATE_ERROR",
		}),
	);
}

/**
 * Write pending sessions to disk.
 */
export function writePending(opts: {
	path: string;
	sessions: PendingSession[];
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			await Bun.write(opts.path, JSON.stringify(opts.sessions, null, 2));
		})(),
		toCliError({
			message: "Failed to write pending queue",
			code: "STATE_ERROR",
		}),
	);
}

/**
 * Add a session to the pending queue.
 */
export function addSession(opts: {
	path: string;
	session: PendingSession;
}): ResultAsync<void, CliError> {
	return readPending(opts.path).andThen((sessions) => {
		sessions.push(opts.session);
		return writePending({ path: opts.path, sessions });
	});
}

/**
 * Update a session by ID with partial updates.
 */
export function updateSession(opts: {
	path: string;
	id: string;
	updates: Partial<PendingSession>;
}): ResultAsync<void, CliError> {
	return readPending(opts.path).andThen((sessions) => {
		const index = sessions.findIndex((s) => s.id === opts.id);
		if (index === -1) {
			return errAsync(
				new CliError({
					message: `Session not found: ${opts.id}`,
					code: "SESSION_NOT_FOUND",
				}),
			);
		}
		sessions[index] = { ...sessions[index], ...opts.updates };
		return writePending({ path: opts.path, sessions });
	});
}

/**
 * Remove a session by ID.
 */
export function removeSession(opts: {
	path: string;
	id: string;
}): ResultAsync<void, CliError> {
	return readPending(opts.path).andThen((sessions) => {
		const filtered = sessions.filter((s) => s.id !== opts.id);
		return writePending({ path: opts.path, sessions: filtered });
	});
}

/**
 * Get a session by ID.
 */
export function getSession(opts: {
	path: string;
	id: string;
}): ResultAsync<PendingSession | undefined, CliError> {
	return readPending(opts.path).map((sessions) =>
		sessions.find((s) => s.id === opts.id),
	);
}
