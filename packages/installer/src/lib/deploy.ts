import type { WorkerAssetFile } from "@/lib/assets";

const CF_API = "https://api.cloudflare.com/client/v4";

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".txt": "text/plain",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".webp": "image/webp",
};

function getContentType({ filePath }: { filePath: string }): string {
	const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
	return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

type AssetManifest = Record<string, { hash: string; size: number }>;

type UploadSessionResponse = {
	jwt: string;
	buckets: string[][];
};

async function hashFile({
	content,
}: {
	content: ArrayBuffer;
}): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", content);
	const arr = new Uint8Array(digest);
	const hex = Array.from(arr)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	// Cloudflare expects the first 32 hex chars
	return hex.slice(0, 32);
}

function buildManifest({
	assets,
	hashes,
}: {
	assets: WorkerAssetFile[];
	hashes: string[];
}): AssetManifest {
	const manifest: AssetManifest = {};
	for (let i = 0; i < assets.length; i++) {
		manifest[assets[i].path] = {
			hash: hashes[i],
			size: assets[i].size,
		};
	}
	return manifest;
}

async function startAssetUploadSession({
	accountId,
	token,
	workerName,
	manifest,
}: {
	accountId: string;
	token: string;
	workerName: string;
	manifest: AssetManifest;
}): Promise<UploadSessionResponse> {
	const res = await fetch(
		`${CF_API}/accounts/${accountId}/workers/scripts/${workerName}/assets-upload-session`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ manifest }),
		},
	);

	const data = (await res.json()) as {
		result: UploadSessionResponse;
		success: boolean;
		errors: Array<{ message: string }>;
	};
	if (!res.ok || !data.success) {
		throw new Error(
			`Failed to start asset upload session: ${data.errors?.[0]?.message ?? res.statusText}`,
		);
	}

	return data.result;
}

function base64Encode({ buffer }: { buffer: ArrayBuffer }): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

async function uploadAssetBuckets({
	accountId,
	uploadToken,
	buckets,
	assets,
	hashes,
}: {
	accountId: string;
	uploadToken: string;
	buckets: string[][];
	assets: WorkerAssetFile[];
	hashes: string[];
}): Promise<string> {
	// Build a hash -> asset lookup
	const hashToAsset = new Map<string, WorkerAssetFile>();
	for (let i = 0; i < assets.length; i++) {
		hashToAsset.set(hashes[i], assets[i]);
	}

	let jwt = uploadToken;

	for (const bucket of buckets) {
		const form = new FormData();

		for (const fileHash of bucket) {
			const asset = hashToAsset.get(fileHash);
			if (!asset) {
				throw new Error(`Asset not found for hash: ${fileHash}`);
			}
			const base64Data = base64Encode({ buffer: asset.content });
			const contentType = getContentType({ filePath: asset.path });
			form.append(
				fileHash,
				new File([base64Data], fileHash, {
					type: contentType,
				}),
				fileHash,
			);
		}

		const res = await fetch(
			`${CF_API}/accounts/${accountId}/workers/assets/upload?base64=true`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${jwt}`,
				},
				body: form,
			},
		);

		const data = (await res.json()) as {
			result: { jwt: string };
			success: boolean;
			errors: Array<{ message: string }>;
		};
		if (!res.ok || !data.success) {
			throw new Error(
				`Failed to upload asset batch: ${data.errors?.[0]?.message ?? res.statusText}`,
			);
		}

		if (data.result.jwt) {
			jwt = data.result.jwt;
		}
	}

	return jwt;
}

type DeployWorkerInput = {
	accountId: string;
	token: string;
	workerName: string;
	workerScript: string;
	workerAssets: WorkerAssetFile[];
	bindings: Array<Record<string, unknown>>;
};

async function deployWorker({
	accountId,
	token,
	workerName,
	workerScript,
	workerAssets,
	bindings,
}: DeployWorkerInput): Promise<{ isSuccess: boolean; error?: string }> {
	// 1. Hash all asset files
	const hashes = await Promise.all(
		workerAssets.map((a) => hashFile({ content: a.content })),
	);

	// 2. Build manifest
	const manifest = buildManifest({ assets: workerAssets, hashes });

	// 3. Start asset upload session
	const session = await startAssetUploadSession({
		accountId,
		token,
		workerName,
		manifest,
	});

	// 4. Upload asset buckets (if any need uploading)
	let assetJwt = session.jwt;
	if (session.buckets.length > 0) {
		assetJwt = await uploadAssetBuckets({
			accountId,
			uploadToken: session.jwt,
			buckets: session.buckets,
			assets: workerAssets,
			hashes,
		});
	}

	// 5. Deploy worker with asset JWT
	const metadata = {
		main_module: "worker.js",
		bindings: [...bindings, { name: "ASSETS", type: "assets" }],
		compatibility_date: "2025-02-14",
		compatibility_flags: ["nodejs_compat"],
		assets: {
			jwt: assetJwt,
		},
	};

	const form = new FormData();
	form.append(
		"worker.js",
		new Blob([workerScript], { type: "application/javascript+module" }),
		"worker.js",
	);
	form.append("metadata", JSON.stringify(metadata));

	const res = await fetch(
		`${CF_API}/accounts/${accountId}/workers/scripts/${workerName}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: form,
		},
	);

	if (!res.ok) {
		const err = await res.text();
		return {
			isSuccess: false,
			error: `Deploy failed (${res.status}): ${err.substring(0, 200)}`,
		};
	}

	return { isSuccess: true };
}

export { deployWorker };
export type { DeployWorkerInput };
