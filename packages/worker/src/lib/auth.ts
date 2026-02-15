/**
 * Password hashing (PBKDF2-SHA256) and stateless session tokens (HMAC-SHA256).
 * Uses only the Web Crypto API -- no external dependencies.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function fromHex(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

/**
 * Hash a password using PBKDF2-SHA256.
 * Returns a string in the format "salt:hash" (both hex-encoded).
 */
async function hashPassword({
	password,
}: {
	password: string;
}): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		256,
	);

	return `${toHex(salt.buffer)}:${toHex(derived)}`;
}

/**
 * Verify a password against a stored "salt:hash" string.
 */
async function verifyPassword({
	password,
	storedHash,
}: {
	password: string;
	storedHash: string;
}): Promise<boolean> {
	const [saltHex, hashHex] = storedHash.split(":");
	if (!saltHex || !hashHex) return false;

	const salt = fromHex(saltHex);

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);

	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		256,
	);

	return toHex(derived) === hashHex;
}

/**
 * Session token lifetime in seconds (7 days).
 */
const SESSION_TTL = 7 * 24 * 60 * 60;

/**
 * Create a signed session token.
 * Format: "username:expiry:signature" where signature is HMAC-SHA256 of "username:expiry".
 */
async function createSessionToken({
	username,
	secret,
}: {
	username: string;
	secret: string;
}): Promise<string> {
	const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL;
	const payload = `${username}:${expiry}`;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payload),
	);

	return `${payload}:${toHex(signature)}`;
}

/**
 * Verify a session token and return the username if valid, or null if invalid/expired.
 */
async function verifySessionToken({
	token,
	secret,
}: {
	token: string;
	secret: string;
}): Promise<string | null> {
	// Format: "username:expiry:signature"
	// Username could contain colons, so we split from the right
	const lastColon = token.lastIndexOf(":");
	if (lastColon === -1) return null;

	const signatureHex = token.slice(lastColon + 1);
	const payloadWithExpiry = token.slice(0, lastColon);

	const secondLastColon = payloadWithExpiry.lastIndexOf(":");
	if (secondLastColon === -1) return null;

	const username = payloadWithExpiry.slice(0, secondLastColon);
	const expiryStr = payloadWithExpiry.slice(secondLastColon + 1);
	const expiry = Number(expiryStr);

	if (!username || Number.isNaN(expiry)) return null;

	// Check expiry
	const now = Math.floor(Date.now() / 1000);
	if (now > expiry) return null;

	// Verify HMAC
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	const payload = `${username}:${expiryStr}`;
	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		fromHex(signatureHex),
		new TextEncoder().encode(payload),
	);

	return isValid ? username : null;
}

export {
	hashPassword,
	verifyPassword,
	createSessionToken,
	verifySessionToken,
	SESSION_TTL,
};
