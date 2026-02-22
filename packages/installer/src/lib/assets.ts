type WorkerAssetFile = {
	path: string;
	content: ArrayBuffer;
	size: number;
};

type Assets = {
	workerScript: string;
	migrationSql: string;
	workerAssets: WorkerAssetFile[];
};

// Static list of worker asset files to load.
// Update this when adding new files to packages/worker/public/.
const WORKER_ASSET_FILES = ["/worker-assets/styles.css"];

async function loadAssets({ fetcher }: { fetcher: Fetcher }): Promise<Assets> {
	const [workerRes, migrationRes, ...assetResponses] = await Promise.all([
		fetcher.fetch(new Request("http://assets/worker-bundle.js")),
		fetcher.fetch(new Request("http://assets/migrations.sql")),
		...WORKER_ASSET_FILES.map((f) =>
			fetcher.fetch(new Request(`http://assets${f}`)),
		),
	]);

	if (!workerRes.ok) {
		throw new Error("Failed to load worker-bundle.js from assets");
	}
	if (!migrationRes.ok) {
		throw new Error("Failed to load migrations.sql from assets");
	}

	const [workerScript, migrationSql] = await Promise.all([
		workerRes.text(),
		migrationRes.text(),
	]);

	const workerAssets: WorkerAssetFile[] = [];
	for (let i = 0; i < WORKER_ASSET_FILES.length; i++) {
		const res = assetResponses[i];
		if (!res.ok) {
			throw new Error(`Failed to load worker asset: ${WORKER_ASSET_FILES[i]}`);
		}
		const content = await res.arrayBuffer();
		// Strip the /worker-assets prefix to get the path as the worker expects it
		const assetPath = WORKER_ASSET_FILES[i].replace("/worker-assets", "");
		workerAssets.push({ path: assetPath, content, size: content.byteLength });
	}

	return { workerScript, migrationSql, workerAssets };
}

export { loadAssets };
export type { Assets, WorkerAssetFile };
