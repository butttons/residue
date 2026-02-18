import { ok, type ResultAsync, safeTry } from "neverthrow";
import {
	getPendingPath,
	getProjectRoot,
	readPending,
	writePending,
} from "@/lib/pending";
import type { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("clear");

export function clear(opts?: { id?: string }): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		if (sessions.length === 0) {
			log.info("No pending sessions to clear.");
			return ok(undefined);
		}

		if (opts?.id) {
			const targetId = opts.id;
			const isFound = sessions.some((s) => s.id === targetId);
			if (!isFound) {
				log.info(`Session ${targetId} not found in pending queue.`);
				return ok(undefined);
			}
			const remaining = sessions.filter((s) => s.id !== targetId);
			yield* writePending({ path: pendingPath, sessions: remaining });
			log.info(`Cleared session ${targetId}.`);
			return ok(undefined);
		}

		const count = sessions.length;
		yield* writePending({ path: pendingPath, sessions: [] });
		log.info(`Cleared ${count} pending session(s).`);
		return ok(undefined);
	});
}
