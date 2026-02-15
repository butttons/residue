import { ResultAsync } from "neverthrow";
import { getCurrentBranch, getCurrentSha } from "@/lib/git";
import type { PendingSession } from "@/lib/pending";
import {
	getPendingPath,
	getProjectRoot,
	readPending,
	writePending,
} from "@/lib/pending";
import type { CliError } from "@/utils/errors";

/**
 * Determine whether a session should be tagged with the current commit.
 *
 * - Open sessions: always tag (the agent is still active, the commit
 *   may contain code produced by this session).
 * - Ended sessions with zero commits: tag once (the session ended before
 *   any capture ran, so the current commit is likely informed by it).
 * - Ended sessions that already have commits: skip (they were already
 *   captured and are just waiting for sync -- tagging them with every
 *   subsequent commit would incorrectly link unrelated work).
 */
function shouldTag(session: PendingSession): boolean {
	if (session.status === "open") return true;
	return session.commits.length === 0;
}

export function capture(): ResultAsync<void, CliError> {
	return ResultAsync.combine([getCurrentSha(), getCurrentBranch()]).andThen(
		([sha, branch]) =>
			getProjectRoot()
				.andThen(getPendingPath)
				.andThen((pendingPath) =>
					readPending(pendingPath).andThen((sessions) => {
						for (const session of sessions) {
							if (!shouldTag(session)) continue;
							const isAlreadyTagged = session.commits.some(
								(c) => c.sha === sha,
							);
							if (!isAlreadyTagged) {
								session.commits.push({ sha, branch });
							}
						}
						return writePending({ path: pendingPath, sessions });
					}),
				),
	);
}
