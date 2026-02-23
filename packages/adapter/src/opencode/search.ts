import { summarizeToolInput } from "@/shared";
import type { SearchLine } from "@/types";

/**
 * OpenCode search text extractor.
 *
 * Parses JSON session data (array of {info, parts}) and produces
 * lightweight SearchLine entries for search indexing.
 */

type OpenCodePart = {
	type: string;
	text?: string;
	tool?: string;
	state?: {
		status: string;
		input?: Record<string, unknown>;
	};
};

type OpenCodeWithParts = {
	info: {
		role: string;
		id: string;
		sessionID: string;
		time: { created: number };
		modelID?: string;
		providerID?: string;
	};
	parts: OpenCodePart[];
};

function extractOpencode(raw: string): SearchLine[] {
	const lines: SearchLine[] = [];
	if (!raw.trim()) return lines;

	let entries: OpenCodeWithParts[];
	try {
		entries = JSON.parse(raw) as OpenCodeWithParts[];
	} catch {
		return lines;
	}

	if (!Array.isArray(entries)) return lines;

	for (const entry of entries) {
		const info = entry.info;
		const parts = entry.parts ?? [];

		if (info.role === "user") {
			const text = parts
				.filter((p) => p.type === "text" && p.text)
				.map((p) => p.text!)
				.join("\n")
				.trim();
			if (text) lines.push({ role: "human", text });
		} else if (info.role === "assistant") {
			for (const part of parts) {
				if (part.type === "text" && part.text) {
					const trimmed = part.text.trim();
					if (trimmed) lines.push({ role: "assistant", text: trimmed });
				} else if (part.type === "tool" && part.tool) {
					const desc = summarizeToolInput(part.tool, part.state?.input);
					lines.push({ role: "tool", text: desc });
				}
				// Skip reasoning, step-start, step-finish, snapshot, patch, etc.
			}
		}
	}

	return lines;
}

/**
 * Extract the first user message from an opencode session.
 * Returns the text truncated to 200 characters, or null if none found.
 */
function extractFirstMessage(raw: string): string | null {
	let entries: OpenCodeWithParts[];
	try {
		entries = JSON.parse(raw) as OpenCodeWithParts[];
	} catch {
		return null;
	}

	if (!Array.isArray(entries)) return null;

	for (const entry of entries) {
		if (entry.info.role !== "user") continue;
		const text = (entry.parts ?? [])
			.filter((p) => p.type === "text" && p.text)
			.map((p) => p.text!)
			.join("\n")
			.trim();
		if (text) return text.slice(0, 200);
	}
	return null;
}

/**
 * Extract the session name from an opencode session.
 * OpenCode does not store session names in the message data.
 */
function extractSessionName(_raw: string): string | null {
	return null;
}

export { extractOpencode, extractFirstMessage, extractSessionName };
