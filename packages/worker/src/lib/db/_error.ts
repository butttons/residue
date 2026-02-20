type ErrorCode =
	| "GET_FAILED"
	| "CREATE_FAILED"
	| "UPDATE_FAILED"
	| "DELETE_FAILED"
	| "NOT_FOUND";

type DBErrorOptions = {
	source: string;
	code: ErrorCode;
	cause?: unknown;
};

class DBError extends Error {
	readonly _tag = "DBError";
	readonly code: ErrorCode;
	readonly source: string;

	constructor(message: string, options: DBErrorOptions) {
		const finalMessage = options.cause
			? `${message} - ${options.cause}`
			: message;
		super(`[${options.source}] ${finalMessage}`, { cause: options.cause });
		this.code = options.code;
		this.source = options.source;
	}
}

const isDBError = (error: unknown): error is DBError => {
	return error instanceof DBError;
};

export { DBError, isDBError };
export type { ErrorCode };
