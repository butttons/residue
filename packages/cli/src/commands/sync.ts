import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from "neverthrow";
import { readConfig } from "@/lib/config";
import { getCommitMeta, getRemoteUrl, parseRemote } from "@/lib/git";
import type { CommitRef, PendingSession } from "@/lib/pending";
import {
	getPendingPath,
	getProjectRoot,
	readPending,
	writePending,
} from "@/lib/pending";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("sync");

import { stat } from "fs/promises";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

type CommitPayload = {
	sha: string;
	org: string;
	repo: string;
	message: string;
	author: string;
	committed_at: number;
	branch: string;
};

function postSession(opts: {
	workerUrl: string;
	token: string;
	session: {
		id: string;
		agent: string;
		agent_version: string;
		status: string;
		data: string;
	};
	commits: CommitPayload[];
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		fetch(`${opts.workerUrl}/api/sessions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${opts.token}`,
			},
			body: JSON.stringify({
				session: opts.session,
				commits: opts.commits,
			}),
		}).then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
		}),
		toCliError({ message: "Upload failed", code: "NETWORK_ERROR" }),
	);
}

function readSessionData(
	dataPath: string,
): ResultAsync<string | null, CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const file = Bun.file(dataPath);
			const isExists = await file.exists();
			if (!isExists) return null;
			return file.text();
		})(),
		toCliError({ message: "Failed to read session data", code: "IO_ERROR" }),
	);
}

function buildCommitMeta(opts: {
	commitRefs: CommitRef[];
	org: string;
	repo: string;
}): ResultAsync<CommitPayload[], CliError> {
	return ResultAsync.fromSafePromise(
		(async () => {
			const commits: CommitPayload[] = [];
			for (const ref of opts.commitRefs) {
				const metaResult = await getCommitMeta(ref.sha);
				if (metaResult.isErr()) {
					log.warn(metaResult.error);
					continue;
				}
				commits.push({
					sha: ref.sha,
					org: opts.org,
					repo: opts.repo,
					message: metaResult.value.message,
					author: metaResult.value.author,
					committed_at: metaResult.value.committed_at,
					branch: ref.branch,
				});
			}
			return commits;
		})(),
	);
}

function getFileMtimeMs(path: string): ResultAsync<number | null, CliError> {
	return ResultAsync.fromPromise(
		stat(path).then((s) => s.mtimeMs),
		toCliError({ message: "Failed to stat file", code: "IO_ERROR" }),
	).orElse(() => okAsync(null));
}

/**
 * Mark open sessions as ended if their data file hasn't been modified
 * in the last 30 minutes. This handles dangling sessions from crashed
 * or closed agent processes that never called session-end.
 */
function closeStaleOpenSessions(opts: {
	sessions: PendingSession[];
}): ResultAsync<PendingSession[], CliError> {
	const now = Date.now();
	const openSessions = opts.sessions.filter((s) => s.status === "open");

	if (openSessions.length === 0) {
		return okAsync(opts.sessions);
	}

	const checks = openSessions.map((session) =>
		getFileMtimeMs(session.data_path).map((mtimeMs) => {
			if (mtimeMs === null) {
				session.status = "ended";
				log.debug(
					"auto-closed session %s (data file not accessible)",
					session.id,
				);
			} else {
				const msSinceModified = now - mtimeMs;
				if (msSinceModified > STALE_THRESHOLD_MS) {
					session.status = "ended";
					log.debug(
						"auto-closed stale session %s (data file unchanged for %dm)",
						session.id,
						Math.round(msSinceModified / 60_000),
					);
				}
			}
		}),
	);

	return ResultAsync.combine(checks).map(() => opts.sessions);
}

function syncSessions(opts: {
	sessions: PendingSession[];
	workerUrl: string;
	token: string;
	org: string;
	repo: string;
}): ResultAsync<PendingSession[], CliError> {
	return ResultAsync.fromSafePromise(
		(async () => {
			const remaining: PendingSession[] = [];

			for (const session of opts.sessions) {
				if (session.commits.length === 0) {
					remaining.push(session);
					continue;
				}

				const dataResult = await readSessionData(session.data_path);
				if (dataResult.isErr()) {
					log.warn(dataResult.error);
					remaining.push(session);
					continue;
				}

				const data = dataResult.value;
				if (data === null) {
					log.warn(
						`dropping session ${session.id}: data file missing at ${session.data_path}`,
					);
					continue;
				}

				const commitsResult = await buildCommitMeta({
					commitRefs: session.commits,
					org: opts.org,
					repo: opts.repo,
				});
				if (commitsResult.isErr()) {
					log.warn(commitsResult.error);
					remaining.push(session);
					continue;
				}

				const uploadResult = await postSession({
					workerUrl: opts.workerUrl,
					token: opts.token,
					session: {
						id: session.id,
						agent: session.agent,
						agent_version: session.agent_version,
						status: session.status,
						data,
					},
					commits: commitsResult.value,
				});

				if (uploadResult.isErr()) {
					log.warn(
						`upload failed for session ${session.id}: ${uploadResult.error.message}`,
					);
					remaining.push(session);
					continue;
				}

				if (session.status === "open") {
					remaining.push(session);
				}

				log.debug("synced session %s", session.id);
			}

			return remaining;
		})(),
	);
}

function resolveRemote(
	remoteUrl?: string,
): ResultAsync<{ org: string; repo: string }, CliError> {
	if (remoteUrl && remoteUrl.length > 0) {
		const result = parseRemote(remoteUrl);
		if (result.isOk()) {
			return okAsync(result.value);
		}
	}
	return getRemoteUrl().andThen(parseRemote);
}

export function sync(opts?: {
	remoteUrl?: string;
}): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const config = yield* readConfig();
		if (!config) {
			return err(
				new CliError({
					message: "Not configured. Run 'residue login' first.",
					code: "CONFIG_MISSING",
				}),
			);
		}

		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		if (sessions.length === 0) {
			return ok(undefined);
		}

		const updatedSessions = yield* closeStaleOpenSessions({ sessions });
		const { org, repo } = yield* resolveRemote(opts?.remoteUrl);
		const remaining = yield* syncSessions({
			sessions: updatedSessions,
			workerUrl: config.worker_url,
			token: config.token,
			org,
			repo,
		});

		yield* writePending({ path: pendingPath, sessions: remaining });
		return ok(undefined);
	});
}
