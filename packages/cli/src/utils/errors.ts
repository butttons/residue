import type { ResultAsync } from "neverthrow";
import { createLogger } from "@/utils/logger";

const log = createLogger("cli");

type CliErrorCode =
	| "GIT_ERROR"
	| "GIT_PARSE_ERROR"
	| "CONFIG_ERROR"
	| "CONFIG_MISSING"
	| "STATE_ERROR"
	| "SESSION_NOT_FOUND"
	| "IO_ERROR"
	| "NETWORK_ERROR"
	| "VALIDATION_ERROR"
	| "PARSE_ERROR";

class CliError extends Error {
	readonly _tag = "CliError" as const;
	readonly code: CliErrorCode;

	constructor(opts: { message: string; code: CliErrorCode; cause?: unknown }) {
		super(opts.message, { cause: opts.cause });
		this.name = "CliError";
		this.code = opts.code;
	}
}

const isCliError = (error: unknown): error is CliError => {
	return error instanceof CliError;
};

/**
 * Creates an error handler for ResultAsync.fromPromise that wraps
 * the caught value into a CliError.
 */
const toCliError =
	(opts: { message: string; code: CliErrorCode }) =>
	(cause: unknown): CliError =>
		new CliError({ ...opts, cause });

type CommandFn = (...args: never[]) => ResultAsync<void, CliError>;

// Wraps a command that returns ResultAsync<void, CliError> with consistent error handling.
// On Err, prints to stderr and exits with the given code.
function wrapCommand<T extends CommandFn>(
	fn: T,
	opts?: { exitCode?: number },
): (...args: Parameters<T>) => Promise<void> {
	const exitCode = opts?.exitCode ?? 1;
	return async (...args: Parameters<T>) => {
		const result = await fn(...args);
		if (result.isErr()) {
			log.error(result.error);
			process.exit(exitCode);
		}
	};
}

// Wraps a command that should never block git operations (hooks).
// Errors are printed as warnings and exit 0 so git proceeds.
function wrapHookCommand<T extends CommandFn>(
	fn: T,
): (...args: Parameters<T>) => Promise<void> {
	return wrapCommand(fn, { exitCode: 0 });
}

export {
	CliError,
	type CliErrorCode,
	isCliError,
	toCliError,
	wrapCommand,
	wrapHookCommand,
};
