import { err, ok, safeTry } from "neverthrow";
import type { ResultAsync } from "neverthrow";
import {
	getPendingPath,
	getProjectRoot,
	getSession,
	updateSession,
} from "@/lib/pending";
import { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("session");

export function sessionEnd(opts: { id: string }): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const session = yield* getSession({ path: pendingPath, id: opts.id });

		if (!session) {
			return err(
				new CliError({
					message: `Session not found: ${opts.id}`,
					code: "SESSION_NOT_FOUND",
				}),
			);
		}

		yield* updateSession({
			path: pendingPath,
			id: opts.id,
			updates: { status: "ended" },
		});

		log.debug("session %s ended", opts.id);
		return ok(undefined);
	});
}
