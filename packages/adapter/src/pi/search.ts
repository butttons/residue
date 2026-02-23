import { summarizeToolInput } from "@/shared";
import type { SearchLine } from "@/types";

/**
 * Pi search text extractor.
 *
 * Parses JSONL session data and produces lightweight SearchLine entries
 * for search indexing. Strips thinking blocks, tool output, token
 * metadata, and other noise.
 */

type PiContentBlock = {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	arguments?: Record<string, unknown>;
};

type PiEntry = {
	type: string;
	message?: {
		role?: string;
		content?: string | PiContentBlock[];
	};
};

function extractPi(raw: string): SearchLine[] {
	const lines: SearchLine[] = [];
	if (!raw.trim()) return lines;

	const entries: PiEntry[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line) as PiEntry);
		} catch {
			// skip malformed
		}
	}

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg) continue;

		if (msg.role === "user") {
			const content = msg.content;
			if (!content) continue;

			if (typeof content === "string") {
				const trimmed = content.trim();
				if (trimmed) lines.push({ role: "human", text: trimmed });
			} else if (Array.isArray(content)) {
				const text = content
					.filter((b) => b.type === "text" && b.text)
					.map((b) => b.text!)
					.join("\n")
					.trim();
				if (text) lines.push({ role: "human", text });
			}
		} else if (msg.role === "assistant") {
			const content = msg.content;
			if (!Array.isArray(content)) {
				if (typeof content === "string" && content.trim()) {
					lines.push({ role: "assistant", text: content.trim() });
				}
				continue;
			}

			for (const block of content) {
				if (block.type === "text" && block.text) {
					const trimmed = block.text.trim();
					if (trimmed) lines.push({ role: "assistant", text: trimmed });
				} else if (block.type === "toolCall" && block.name) {
					const desc = summarizeToolInput(block.name, block.arguments);
					lines.push({ role: "tool", text: desc });
				}
				// Skip thinking blocks
			}
		}
		// Skip toolResult, session, compaction, etc.
	}

	return lines;
}

/**
 * Extract the first user message from a pi session.
 * Returns the text truncated to 200 characters, or null if none found.
 */
function extractFirstMessage(raw: string): string | null {
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		let entry: PiEntry;
		try {
			entry = JSON.parse(line) as PiEntry;
		} catch {
			continue;
		}
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg || msg.role !== "user") continue;

		const content = msg.content;
		if (!content) continue;

		if (typeof content === "string") {
			const trimmed = content.trim();
			if (trimmed) return trimmed.slice(0, 200);
		} else if (Array.isArray(content)) {
			const text = content
				.filter((b) => b.type === "text" && b.text)
				.map((b) => b.text!)
				.join("\n")
				.trim();
			if (text) return text.slice(0, 200);
		}
	}
	return null;
}

/**
 * Extract the session name from a pi session.
 * Pi stores custom entries with customType "session-name" when the user
 * uses /name. Falls back to checking the session header for a name field.
 */
function extractSessionName(raw: string): string | null {
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line) as Record<string, unknown>;
			if (
				entry.type === "custom" &&
				entry.customType === "session-name" &&
				typeof (entry as Record<string, unknown>).data === "object"
			) {
				const data = (entry as Record<string, unknown>).data as Record<
					string,
					unknown
				>;
				if (typeof data.name === "string") return data.name;
			}
		} catch {}
	}
	return null;
}

export { extractPi, extractFirstMessage, extractSessionName };
