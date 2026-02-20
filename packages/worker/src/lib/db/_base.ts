import type { ErrorCode } from "./_error";
import { DBError } from "./_error";
import type { Result } from "./_result";
import { fromPromise } from "./_result";

class BaseDataLayer {
	protected db: D1Database;

	constructor({ db }: { db: D1Database }) {
		this.db = db;
	}

	protected run<T>({
		promise,
		source,
		code,
	}: {
		promise: Promise<T>;
		source: string;
		code: ErrorCode;
	}): Promise<Result<T, DBError>> {
		return fromPromise({
			promise,
			errorMapper: (error) =>
				new DBError(`Failed: ${source}`, { source, code, cause: error }),
		});
	}
}

export { BaseDataLayer };
