import { stat } from "fs/promises";
import { ok, ResultAsync, safeTry } from "neverthrow";
import type { CommitRef, PendingSession } from "@/lib/pending";
import {
	getPendingPath,
	getProjectRoot,
	readPending,
	writePending,
} from "@/lib/pending";
import type { CliError } from "@/utils/errors";
import { CliError as CliErrorClass, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("doctor");

type GitCommit = {
	sha: string;
	branch: string;
	timestamp: number;
	message: string;
};

/**
 * Parse session start time from the data_path filename.
 * Filenames look like: 2026-02-20T06-27-18-861Z_<uuid>.jsonl
 * The timestamp portion uses hyphens instead of colons (filesystem-safe).
 */
export function parseSessionStartTime(dataPath: string): number | null {
	const filename = dataPath.split("/").pop();
	if (!filename) return null;

	// Extract the timestamp portion before the UUID
	const match = filename.match(
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/,
	);
	if (!match) return null;

	const [, year, month, day, hour, minute, second, ms] = match;
	const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
	const time = new Date(iso).getTime();
	return Number.isNaN(time) ? null : time;
}

type FileTimes = {
	birthtimeMs: number;
	mtimeMs: number;
};

/**
 * Get file birthtime and mtime as epoch ms. Returns null if the file doesn't exist.
 */
function getFileTimes(path: string): ResultAsync<FileTimes | null, CliError> {
	return ResultAsync.fromPromise(
		stat(path)
			.then((s) => ({ birthtimeMs: s.birthtimeMs, mtimeMs: s.mtimeMs }))
			.catch(() => null),
		toCliError({ message: "Failed to stat file", code: "IO_ERROR" }),
	);
}

/**
 * Get all commits across all branches in a time range.
 * Returns commits sorted by timestamp ascending.
 */
function getCommitsInRange(opts: {
	sinceEpochSec: number;
	untilEpochSec: number;
}): ResultAsync<GitCommit[], CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			// Use git log --all to get commits from all branches.
			// Format: sha|branch_names|unix_timestamp|subject
			const proc = Bun.spawn(
				[
					"git",
					"log",
					"--all",
					`--since=${opts.sinceEpochSec}`,
					`--until=${opts.untilEpochSec}`,
					"--format=%H|%D|%ct|%s",
					"--no-merges",
				],
				{
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new CliErrorClass({
					message: stderr.trim() || `git log failed with exit ${exitCode}`,
					code: "GIT_ERROR",
				});
			}
			const text = (await new Response(proc.stdout).text()).trim();
			if (!text) return [];

			const commits: GitCommit[] = [];
			for (const line of text.split("\n")) {
				if (!line) continue;
				const parts = line.split("|");
				if (parts.length < 4) continue;

				const sha = parts[0];
				const refNames = parts[1];
				const timestamp = parseInt(parts[2], 10) * 1000;
				const message = parts.slice(3).join("|");

				// Extract branch name from ref decorations.
				// Refs look like: "HEAD -> main, origin/feat/installer, feat/installer"
				// We want the local branch name, or fall back to first remote branch.
				const branch = parseBranchFromRefs(refNames);

				commits.push({ sha, branch, timestamp, message });
			}

			// Sort ascending by timestamp
			commits.sort((a, b) => a.timestamp - b.timestamp);
			return commits;
		})(),
		toCliError({
			message: "Failed to list git commits",
			code: "GIT_ERROR",
		}),
	);
}

/**
 * Parse branch name from git's %D ref decoration string.
 * Prefers local branches over remote tracking refs.
 * Falls back to "unknown" if nothing useful is found.
 */
export function parseBranchFromRefs(refString: string): string {
	if (!refString.trim()) return "unknown";

	const refs = refString.split(",").map((r) => r.trim());

	// First pass: look for "HEAD -> <branch>" pattern
	for (const ref of refs) {
		const headMatch = ref.match(/HEAD -> (.+)/);
		if (headMatch) return headMatch[1];
	}

	// Second pass: look for local branch names (no "origin/" prefix, no "tag:" prefix)
	for (const ref of refs) {
		if (!ref.includes("/") && !ref.startsWith("tag:") && ref !== "HEAD") {
			return ref;
		}
	}

	// Third pass: use remote branch, strip "origin/"
	for (const ref of refs) {
		const remoteMatch = ref.match(/^origin\/(.+)/);
		if (remoteMatch) return remoteMatch[1];
	}

	return "unknown";
}

/**
 * For commits with "unknown" branch, try to find which branch contains them.
 * Uses git branch --contains for each unique SHA with unknown branch.
 */
function resolveBranches(opts: {
	commits: GitCommit[];
}): ResultAsync<GitCommit[], CliError> {
	return ResultAsync.fromPromise(
		(async () => {
			const unknowns = opts.commits.filter((c) => c.branch === "unknown");
			if (unknowns.length === 0) return opts.commits;

			// Dedupe SHAs to avoid redundant git calls
			const uniqueShas = [...new Set(unknowns.map((c) => c.sha))];
			const branchMap = new Map<string, string>();

			for (const sha of uniqueShas) {
				const proc = Bun.spawn(
					["git", "branch", "--contains", sha, "--format=%(refname:short)"],
					{ stdout: "pipe", stderr: "pipe" },
				);
				await proc.exited;
				const text = (await new Response(proc.stdout).text()).trim();
				if (text) {
					// Pick first non-HEAD branch
					const branches = text.split("\n").filter((b) => b && b !== "HEAD");
					if (branches.length > 0) {
						branchMap.set(sha, branches[0]);
					}
				}
			}

			return opts.commits.map((c) => {
				if (c.branch === "unknown" && branchMap.has(c.sha)) {
					return { ...c, branch: branchMap.get(c.sha) as string };
				}
				return c;
			});
		})(),
		toCliError({
			message: "Failed to resolve branches",
			code: "GIT_ERROR",
		}),
	);
}

type SessionWindow = {
	session: PendingSession;
	startTime: number;
	endTime: number;
};

type DoctorResult = {
	session: PendingSession;
	linkedCommits: GitCommit[];
};

function formatTimestamp(epochMs: number): string {
	const d = new Date(epochMs);
	const month = d.toLocaleString("en-US", {
		month: "short",
		timeZone: "UTC",
	});
	const day = d.getUTCDate();
	const h = String(d.getUTCHours()).padStart(2, "0");
	const m = String(d.getUTCMinutes()).padStart(2, "0");
	return `${month} ${day}, ${h}:${m} UTC`;
}

export function doctor(): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		// Filter to orphaned sessions (no commits linked)
		const orphaned = sessions.filter((s) => s.commits.length === 0);

		if (orphaned.length === 0) {
			log.info("No orphaned sessions found. All sessions have commits linked.");
			return ok(undefined);
		}

		log.info(
			`Found ${orphaned.length} orphaned session(s) (no commits linked)`,
		);
		log.info("");

		// Build time windows for each orphaned session.
		//
		// Start time resolution order:
		//   1. Parse from data_path filename (pi agent encodes timestamps)
		//   2. File birthtime (works for all agents)
		//
		// End time: file mtime (last write = last conversation turn),
		// or Date.now() for open sessions.
		const windows: SessionWindow[] = [];
		let skippedMissing = 0;
		for (const session of orphaned) {
			const fileTimes = yield* getFileTimes(session.data_path);

			// If the data file is missing, skip -- we can't upload it anyway
			if (fileTimes === null) {
				skippedMissing++;
				continue;
			}

			const filenameTime = parseSessionStartTime(session.data_path);
			const startTime = filenameTime ?? fileTimes.birthtimeMs;
			const endTime =
				session.status === "open" ? Date.now() : fileTimes.mtimeMs;

			windows.push({ session, startTime, endTime });
		}

		if (skippedMissing > 0) {
			log.warn(`Skipped ${skippedMissing} session(s) with missing data files`);
			log.info("");
		}

		if (windows.length === 0) {
			log.info("No sessions with parseable timestamps. Nothing to do.");
			return ok(undefined);
		}

		// Find the overall time range across all sessions
		const earliestStart = Math.min(...windows.map((w) => w.startTime));
		const latestEnd = Math.max(...windows.map((w) => w.endTime));

		log.info(
			`Scanning git history from ${formatTimestamp(earliestStart)} to ${formatTimestamp(latestEnd)}...`,
		);
		log.info("");

		// Get all commits in that range (with a small buffer on each side)
		const bufferMs = 60 * 60 * 1000; // 1 hour buffer
		let commits = yield* getCommitsInRange({
			sinceEpochSec: Math.floor((earliestStart - bufferMs) / 1000),
			untilEpochSec: Math.ceil((latestEnd + bufferMs) / 1000),
		});

		// Resolve unknown branches
		commits = yield* resolveBranches({ commits });

		if (commits.length === 0) {
			log.info("No commits found in the time range. Nothing to link.");
			return ok(undefined);
		}

		log.info(`Found ${commits.length} commit(s) in range`);
		log.info("");

		// Match: a commit belongs to a session if the commit timestamp
		// falls within the session's [startTime, endTime] window
		const results: DoctorResult[] = [];
		let totalLinked = 0;

		for (const window of windows) {
			const matching = commits.filter(
				(c) => c.timestamp >= window.startTime && c.timestamp <= window.endTime,
			);

			results.push({
				session: window.session,
				linkedCommits: matching,
			});

			const shortId = window.session.id.slice(0, 8);
			const start = formatTimestamp(window.startTime);
			const end = formatTimestamp(window.endTime);

			log.info(`  Session ${shortId} (${start} - ${end})`);

			if (matching.length === 0) {
				log.info("    -> (no matching commits)");
			} else {
				for (const commit of matching) {
					const shortSha = commit.sha.slice(0, 7);
					log.info(`    -> ${shortSha} ${commit.message} [${commit.branch}]`);
				}
				totalLinked += matching.length;
			}

			log.info("");
		}

		// Apply the links to pending.json
		const sessionsWithLinks = results.filter((r) => r.linkedCommits.length > 0);

		if (sessionsWithLinks.length === 0) {
			log.info("No sessions could be linked to commits.");
			return ok(undefined);
		}

		// Build a lookup for quick update
		const linkMap = new Map<string, CommitRef[]>();
		for (const result of sessionsWithLinks) {
			linkMap.set(
				result.session.id,
				result.linkedCommits.map((c) => ({ sha: c.sha, branch: c.branch })),
			);
		}

		// Update sessions in place
		for (const session of sessions) {
			const newCommits = linkMap.get(session.id);
			if (newCommits) {
				session.commits = newCommits;
			}
		}

		yield* writePending({ path: pendingPath, sessions });

		log.info(
			`Tagged ${sessionsWithLinks.length} session(s) with ${totalLinked} commit(s).`,
		);
		log.info('Run "residue push" to upload.');

		return ok(undefined);
	});
}
