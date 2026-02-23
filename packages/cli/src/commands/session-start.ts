import { deriveSessionId } from "@residue/adapter/shared";
import type { ResultAsync } from "neverthrow";
import { ok, safeTry } from "neverthrow";
import {
	addSession,
	getPendingPath,
	getProjectRoot,
	readPending,
	updateSession,
} from "@/lib/pending";
import type { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("session");

export function sessionStart(opts: {
	agent: string;
	data: string;
	agentVersion: string;
}): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		// Derive a deterministic ID from the data path so the same
		// agent session file always maps to the same residue session.
		const id = deriveSessionId(opts.data);

		const existing = sessions.find((s) => s.id === id);
		if (existing) {
			// Re-open the session if it was previously ended by stale detection
			if (existing.status === "ended") {
				yield* updateSession({
					path: pendingPath,
					id: existing.id,
					updates: { status: "open" },
				});
			}
			process.stdout.write(existing.id);
			log.debug("reused existing session %s for %s", existing.id, opts.agent);
			return ok(undefined);
		}

		yield* addSession({
			path: pendingPath,
			session: {
				id,
				agent: opts.agent,
				agent_version: opts.agentVersion,
				status: "open",
				data_path: opts.data,
				commits: [],
			},
		});

		// Only the session ID goes to stdout so adapters can capture it
		process.stdout.write(id);
		log.debug("session started for %s", opts.agent);
		return ok(undefined);
	});
}
