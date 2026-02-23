import {
	buildSearchText,
	getExtractor,
	getMetadataExtractors,
} from "@residue/adapter/search";
import { err, ok, okAsync, ResultAsync, safeTry } from "neverthrow";
import { resolveConfig } from "@/lib/config";
import { residueFetch } from "@/lib/fetch";
import {
	type CommitFile,
	getCommitFiles,
	getCommitMeta,
	getRemoteUrl,
	parseRemote,
} from "@/lib/git";
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

type CommitFilePayload = {
	path: string;
	change_type: string;
	lines_added: number;
	lines_deleted: number;
};

type CommitPayload = {
	sha: string;
	org: string;
	repo: string;
	message: string;
	author: string;
	committed_at: number;
	branch: string;
	files: CommitFilePayload[];
};

type UploadUrlResponse = {
	url: string;
	r2_key: string;
	search_url: string;
	search_r2_key: string;
};

function requestUploadUrl(opts: {
	workerUrl: string;
	token: string;
	sessionId: string;
}): ResultAsync<UploadUrlResponse, CliError> {
	return ResultAsync.fromPromise(
		residueFetch(`${opts.workerUrl}/api/sessions/upload-url`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${opts.token}`,
			},
			body: JSON.stringify({ session_id: opts.sessionId }),
		}).then(async (response) => {
			if (!response.ok) {
				throw new CliError({
					message: `HTTP ${response.status}`,
					code: "NETWORK_ERROR",
				});
			}
			return response.json() as Promise<UploadUrlResponse>;
		}),
		toCliError({
			message: "Failed to request upload URL",
			code: "NETWORK_ERROR",
		}),
	);
}

function uploadToPresignedUrl(opts: {
	url: string;
	data: string;
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		fetch(opts.url, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: opts.data,
		}).then((response) => {
			if (!response.ok) {
				throw new CliError({
					message: `R2 upload failed: HTTP ${response.status}`,
					code: "NETWORK_ERROR",
				});
			}
		}),
		toCliError({ message: "Direct R2 upload failed", code: "NETWORK_ERROR" }),
	);
}

function postSessionMetadata(opts: {
	workerUrl: string;
	token: string;
	session: {
		id: string;
		agent: string;
		agent_version: string;
		status: string;
		data_path?: string;
		first_message?: string;
		session_name?: string;
	};
	commits: CommitPayload[];
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		residueFetch(`${opts.workerUrl}/api/sessions`, {
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
				throw new CliError({
					message: `HTTP ${response.status}`,
					code: "NETWORK_ERROR",
				});
			}
		}),
		toCliError({ message: "Metadata upload failed", code: "NETWORK_ERROR" }),
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

function toFilePayloads(files: CommitFile[]): CommitFilePayload[] {
	return files.map((f) => ({
		path: f.path,
		change_type: f.changeType,
		lines_added: f.linesAdded,
		lines_deleted: f.linesDeleted,
	}));
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
				const filesResult = await getCommitFiles(ref.sha);
				const files = filesResult.isOk() ? filesResult.value : [];
				if (filesResult.isErr()) {
					log.warn(filesResult.error);
				}
				commits.push({
					sha: ref.sha,
					org: opts.org,
					repo: opts.repo,
					message: metaResult.value.message,
					author: metaResult.value.author,
					committed_at: metaResult.value.committed_at,
					branch: ref.branch,
					files: toFilePayloads(files),
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

type SessionMetadataFields = {
	firstMessage: string | null;
	sessionName: string | null;
};

function extractSessionMetadata(opts: {
	agent: string;
	rawData: string;
}): SessionMetadataFields {
	const ext = getMetadataExtractors(opts.agent);
	if (!ext) return { firstMessage: null, sessionName: null };
	return {
		firstMessage: ext.extractFirstMessage(opts.rawData),
		sessionName: ext.extractSessionName(opts.rawData),
	};
}

function generateSearchText(opts: {
	session: PendingSession;
	rawData: string;
	commits: CommitPayload[];
	org: string;
	repo: string;
	sessionMetadata: SessionMetadataFields;
}): string | null {
	const extractor = getExtractor(opts.session.agent);
	if (!extractor) {
		log.debug(
			"no search text extractor for agent %s, skipping",
			opts.session.agent,
		);
		return null;
	}

	const searchLines = extractor(opts.rawData);
	if (searchLines.length === 0) return null;

	const branches = [
		...new Set(opts.session.commits.map((c) => c.branch).filter(Boolean)),
	];

	// Collect unique file paths across all commits for this session
	const filePaths = [
		...new Set(opts.commits.flatMap((c) => c.files.map((f) => f.path))),
	];
	if (filePaths.length > 0) {
		searchLines.push({ role: "files", text: filePaths.join(", ") });
	}

	return buildSearchText({
		metadata: {
			sessionId: opts.session.id,
			agent: opts.session.agent,
			commits: opts.commits.map((c) => c.sha.slice(0, 7)),
			branch: branches[0] ?? "",
			repo: `${opts.org}/${opts.repo}`,
			dataPath: opts.session.data_path,
			firstMessage: opts.sessionMetadata.firstMessage ?? undefined,
			sessionName: opts.sessionMetadata.sessionName ?? undefined,
		},
		lines: searchLines,
	});
}

function uploadSearchText(opts: {
	url: string;
	data: string;
}): ResultAsync<void, CliError> {
	return ResultAsync.fromPromise(
		fetch(opts.url, {
			method: "PUT",
			headers: { "Content-Type": "text/plain" },
			body: opts.data,
		}).then((response) => {
			if (!response.ok) {
				throw new CliError({
					message: `R2 search upload failed: HTTP ${response.status}`,
					code: "NETWORK_ERROR",
				});
			}
		}),
		toCliError({
			message: "Search text R2 upload failed",
			code: "NETWORK_ERROR",
		}),
	);
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

				// Step 1: Get presigned URLs from the worker (raw + search)
				const uploadUrlResult = await requestUploadUrl({
					workerUrl: opts.workerUrl,
					token: opts.token,
					sessionId: session.id,
				});

				if (uploadUrlResult.isErr()) {
					log.warn(
						`failed to get upload URL for session ${session.id}: ${uploadUrlResult.error.message}`,
					);
					remaining.push(session);
					continue;
				}

				// Step 2: Upload session data directly to R2
				const directUploadResult = await uploadToPresignedUrl({
					url: uploadUrlResult.value.url,
					data,
				});

				if (directUploadResult.isErr()) {
					log.warn(
						`R2 upload failed for session ${session.id}: ${directUploadResult.error.message}`,
					);
					remaining.push(session);
					continue;
				}

				log.debug("uploaded session %s data directly to R2", session.id);

				// Extract session metadata from raw data
				const sessionMeta = extractSessionMetadata({
					agent: session.agent,
					rawData: data,
				});

				// Step 2b: Generate and upload search text
				const searchText = generateSearchText({
					session,
					rawData: data,
					commits: commitsResult.value,
					org: opts.org,
					repo: opts.repo,
					sessionMetadata: sessionMeta,
				});

				if (searchText && uploadUrlResult.value.search_url) {
					const searchUploadResult = await uploadSearchText({
						url: uploadUrlResult.value.search_url,
						data: searchText,
					});

					if (searchUploadResult.isErr()) {
						// Non-fatal: search upload failure should not block sync
						log.warn(
							`search text upload failed for session ${session.id}: ${searchUploadResult.error.message}`,
						);
					} else {
						log.debug("uploaded search text for session %s", session.id);
					}
				}

				// Step 3: POST metadata only (no inline data)
				const metadataResult = await postSessionMetadata({
					workerUrl: opts.workerUrl,
					token: opts.token,
					session: {
						id: session.id,
						agent: session.agent,
						agent_version: session.agent_version,
						status: session.status,
						data_path: session.data_path,
						first_message: sessionMeta.firstMessage ?? undefined,
						session_name: sessionMeta.sessionName ?? undefined,
					},
					commits: commitsResult.value,
				});

				if (metadataResult.isErr()) {
					log.warn(
						`metadata upload failed for session ${session.id}: ${metadataResult.error.message}`,
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
		const config = yield* resolveConfig();
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
