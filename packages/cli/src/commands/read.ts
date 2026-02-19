import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { getPendingPath, getProjectRoot, readPending } from "@/lib/pending";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("read");

export function read(opts: { id: string }): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const projectRoot = yield* getProjectRoot();
		const pendingPath = yield* getPendingPath(projectRoot);
		const sessions = yield* readPending(pendingPath);

		const session = sessions.find((s) => s.id === opts.id);
		if (!session) {
			return err(
				new CliError({
					message: `Session not found in local state: ${opts.id}`,
					code: "SESSION_NOT_FOUND",
				}),
			);
		}

		if (!session.data_path) {
			return err(
				new CliError({
					message: `No data path recorded for session ${opts.id}`,
					code: "VALIDATION_ERROR",
				}),
			);
		}

		const file = Bun.file(session.data_path);
		const isExists = await file.exists();
		if (!isExists) {
			return err(
				new CliError({
					message: `Session data file not found: ${session.data_path}`,
					code: "IO_ERROR",
				}),
			);
		}

		log.debug(`Reading session ${opts.id} from ${session.data_path}`);

		const content = yield* ResultAsync.fromPromise(
			file.text(),
			toCliError({
				message: `Failed to read session data file: ${session.data_path}`,
				code: "IO_ERROR",
			}),
		);

		process.stdout.write(content);

		return ok(undefined);
	});
}
