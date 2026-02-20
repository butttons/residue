type Ok<T> = { isOk: true; isErr: false; value: T };
type Err<E> = { isOk: false; isErr: true; error: E };

type Result<T, E> = Ok<T> | Err<E>;

const ok = <T>(value: T): Ok<T> => ({ isOk: true, isErr: false, value });
const err = <E>(error: E): Err<E> => ({ isOk: false, isErr: true, error });

const fromPromise = async <T, E>({
	promise,
	errorMapper,
}: {
	promise: Promise<T>;
	errorMapper: (error: unknown) => E;
}): Promise<Result<T, E>> => {
	try {
		return ok(await promise);
	} catch (e) {
		return err(errorMapper(e));
	}
};

export { ok, err, fromPromise };
export type { Result, Ok, Err };
