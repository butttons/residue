import { createHash } from "crypto";

/**
 * Derive a deterministic session ID from an agent's data path.
 *
 * Uses a SHA-256 hash of the path, formatted as a UUID v4-like string.
 * This guarantees the same data file always produces the same residue
 * session ID, preventing duplicates across restarts and session switches.
 */
export function deriveSessionId(dataPath: string): string {
	const hash = createHash("sha256").update(dataPath).digest("hex");

	// Format first 32 hex chars as a UUID-like string: 8-4-4-4-12
	return [
		hash.slice(0, 8),
		hash.slice(8, 12),
		hash.slice(12, 16),
		hash.slice(16, 20),
		hash.slice(20, 32),
	].join("-");
}
