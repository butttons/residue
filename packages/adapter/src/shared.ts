import { createHash } from "crypto";

/**
 * Produce a short one-line summary of a tool invocation.
 * Extracts file paths and commands when recognizable.
 */
function summarizeToolInput(
	name: string,
	input: Record<string, unknown> | undefined,
): string {
	if (!input) return name;

	// Common tool patterns
	const path =
		input.path ?? input.file_path ?? input.filePath ?? input.filename;
	if (typeof path === "string") return `${name} ${path}`;

	const command = input.command ?? input.cmd;
	if (typeof command === "string") {
		// Truncate long commands
		const short =
			command.length > 120 ? command.slice(0, 120) + "..." : command;
		return `${name} ${short}`;
	}

	const query = input.query ?? input.search ?? input.pattern;
	if (typeof query === "string") return `${name} ${query}`;

	return name;
}

/**
 * Derive a deterministic session ID from an agent's data path.
 *
 * Uses a SHA-256 hash of the path, formatted as a UUID v4-like string.
 * This guarantees the same data file always produces the same residue
 * session ID, preventing duplicates across restarts and session switches.
 */
function deriveSessionId(dataPath: string): string {
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

export { summarizeToolInput, deriveSessionId };
