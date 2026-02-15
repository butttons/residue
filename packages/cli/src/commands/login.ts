import { errAsync, type ResultAsync } from "neverthrow";
import { writeConfig, writeLocalConfig } from "@/lib/config";
import { getProjectRoot } from "@/lib/pending";
import { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("login");

export function login(opts: {
	url: string;
	token: string;
	isLocal?: boolean;
}): ResultAsync<void, CliError> {
	if (!opts.url.startsWith("http://") && !opts.url.startsWith("https://")) {
		return errAsync(
			new CliError({
				message: "URL must start with http:// or https://",
				code: "VALIDATION_ERROR",
			}),
		);
	}

	const cleanUrl = opts.url.replace(/\/+$/, "");
	const config = { worker_url: cleanUrl, token: opts.token };

	if (opts.isLocal) {
		return getProjectRoot().andThen((projectRoot) =>
			writeLocalConfig({ projectRoot, config }).map(() => {
				log.info(`Logged in to ${cleanUrl} (project-local config)`);
			}),
		);
	}

	return writeConfig(config).map(() => {
		log.info(`Logged in to ${cleanUrl}`);
	});
}
