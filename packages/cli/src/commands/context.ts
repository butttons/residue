import type { ResultAsync } from "neverthrow";
import { okAsync } from "neverthrow";
import type { CliError } from "@/utils/errors";

import content from "./context.md" with { type: "text" };

export function context(): ResultAsync<void, CliError> {
	process.stdout.write(content);
	return okAsync(undefined);
}
