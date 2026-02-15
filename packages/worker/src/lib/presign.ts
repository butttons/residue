/**
 * Lightweight AWS Signature V4 presigned URL generation for R2.
 * Uses only the Web Crypto API -- no AWS SDK dependency needed.
 *
 * R2 exposes an S3-compatible API at:
 *   https://<account-id>.r2.cloudflarestorage.com/<bucket>/<key>
 */

type PresignParams = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucketName: string;
	key: string;
	expiresIn?: number; // seconds, default 3600
};

const REGION = "auto";
const SERVICE = "s3";

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function hmacSha256(
	key: ArrayBuffer | Uint8Array,
	message: string,
): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256Hex(data: string): Promise<string> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(data),
	);
	return toHex(hash);
}

async function getSigningKey(opts: {
	secretAccessKey: string;
	dateStamp: string;
	region: string;
	service: string;
}): Promise<ArrayBuffer> {
	const kDate = await hmacSha256(
		new TextEncoder().encode(`AWS4${opts.secretAccessKey}`),
		opts.dateStamp,
	);
	const kRegion = await hmacSha256(kDate, opts.region);
	const kService = await hmacSha256(kRegion, opts.service);
	return hmacSha256(kService, "aws4_request");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
	const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
	return {
		amzDate: iso,
		dateStamp: iso.slice(0, 8),
	};
}

export async function createPresignedPutUrl(
	params: PresignParams,
): Promise<string> {
	const expiresIn = params.expiresIn ?? 3600;
	const now = new Date();
	const { amzDate, dateStamp } = formatAmzDate(now);

	const host = `${params.accountId}.r2.cloudflarestorage.com`;
	const encodedKey = params.key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	const canonicalUri = `/${params.bucketName}/${encodedKey}`;
	const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
	const credential = `${params.accessKeyId}/${credentialScope}`;

	// Query parameters must be sorted by key for canonical request
	const queryParams = new Map<string, string>([
		["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
		["X-Amz-Credential", credential],
		["X-Amz-Date", amzDate],
		["X-Amz-Expires", String(expiresIn)],
		["X-Amz-SignedHeaders", "host"],
	]);

	const canonicalQueryString = Array.from(queryParams.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([k, v]) =>
				`${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
		)
		.join("&");

	const canonicalHeaders = `host:${host}\n`;
	const signedHeaders = "host";

	// For presigned URLs, payload hash is UNSIGNED-PAYLOAD
	const canonicalRequest = [
		"PUT",
		canonicalUri,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	].join("\n");

	const canonicalRequestHash = await sha256Hex(canonicalRequest);

	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		canonicalRequestHash,
	].join("\n");

	const signingKey = await getSigningKey({
		secretAccessKey: params.secretAccessKey,
		dateStamp,
		region: REGION,
		service: SERVICE,
	});

	const signatureBuffer = await hmacSha256(signingKey, stringToSign);
	const signature = toHex(signatureBuffer);

	return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
