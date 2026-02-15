import { writeConfig } from "@/lib/config";
import { CliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";
import { errAsync, type ResultAsync } from "neverthrow";

const log = createLogger("login");

export function login(opts: { url: string; token: string }): ResultAsync<void, CliError> {
  if (!opts.url.startsWith("http://") && !opts.url.startsWith("https://")) {
    return errAsync(
      new CliError({
        message: "URL must start with http:// or https://",
        code: "VALIDATION_ERROR",
      })
    );
  }

  const cleanUrl = opts.url.replace(/\/+$/, "");

  return writeConfig({ worker_url: cleanUrl, token: opts.token }).map(() => {
    log.info(`Logged in to ${cleanUrl}`);
  });
}
