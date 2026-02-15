import type { ResultAsync } from "neverthrow";
import { addSession, getPendingPath, getProjectRoot } from "@/lib/pending";
import type { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("session");

export function sessionStart(opts: {
	agent: string;
	data: string;
	agentVersion: string;
}): ResultAsync<void, CliError> {
	const id = crypto.randomUUID();

	return getProjectRoot()
		.andThen(getPendingPath)
		.andThen((pendingPath) =>
			addSession({
				path: pendingPath,
				session: {
					id,
					agent: opts.agent,
					agent_version: opts.agentVersion,
					status: "open",
					data_path: opts.data,
					commits: [],
				},
			}),
		)
		.map(() => {
			// Only the session ID goes to stdout so adapters can capture it
			process.stdout.write(id);
			log.debug("session started for %s", opts.agent);
		});
}
