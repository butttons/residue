import packageJson from "../../package.json";

const VERSION = packageJson.version;

let hasWarned = false;

/**
 * Wrapper around fetch that checks the X-Version response header
 * from the worker. Logs a warning (once per process) if the versions
 * don't match. Use this for all requests to the residue worker.
 *
 * For direct R2 uploads (presigned URLs), use plain fetch instead
 * since those don't go through the worker.
 */
export async function residueFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const response = await fetch(input, init);

	if (!hasWarned) {
		const workerVersion = response.headers.get("X-Version");
		if (workerVersion && workerVersion !== VERSION) {
			hasWarned = true;
			console.warn(
				`[residue] version mismatch: CLI is ${VERSION}, worker is ${workerVersion}. Update both to the same version.`,
			);
		}
	}

	return response;
}
