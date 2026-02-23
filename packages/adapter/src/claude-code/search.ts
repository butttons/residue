import { summarizeToolInput } from "@/shared";
import type { SearchLine } from "@/types";

/**
 * Claude Code search text extractor.
 *
 * Parses JSONL session data and produces lightweight SearchLine entries
 * for search indexing. Strips thinking blocks, tool output, token
 * metadata, signatures, and cache data.
 */

type ClaudeContentBlock = {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: string | ClaudeContentBlock[];
};

type ClaudeEntry = {
	type: string;
	isMeta?: boolean;
	isSidechain?: boolean;
	message?: {
		role?: string;
		content?: string | ClaudeContentBlock[];
	};
};

function extractClaudeCode(raw: string): SearchLine[] {
	const lines: SearchLine[] = [];
	if (!raw.trim()) return lines;

	const entries: ClaudeEntry[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line) as ClaudeEntry);
		} catch {
			// skip malformed
		}
	}

	for (const entry of entries) {
		if (entry.isMeta || entry.isSidechain) continue;

		if (entry.type === "user") {
			const content = entry.message?.content;
			if (!content) continue;

			if (typeof content === "string") {
				const trimmed = content.trim();
				if (trimmed) lines.push({ role: "human", text: trimmed });
			} else if (Array.isArray(content)) {
				// Extract text blocks only, skip tool_result blocks
				const hasToolResult = content.some((b) => b.type === "tool_result");
				if (hasToolResult) continue;

				const text = content
					.filter((b) => b.type === "text" && b.text)
					.map((b) => b.text!)
					.join("\n")
					.trim();
				if (text) lines.push({ role: "human", text });
			}
		} else if (entry.type === "assistant") {
			const content = entry.message?.content;
			if (!Array.isArray(content)) continue;

			for (const block of content) {
				if (block.type === "text" && block.text) {
					const trimmed = block.text.trim();
					if (trimmed) lines.push({ role: "assistant", text: trimmed });
				} else if (block.type === "tool_use" && block.name) {
					// Extract tool name + short descriptor from input
					const desc = summarizeToolInput(block.name, block.input);
					lines.push({ role: "tool", text: desc });
				}
				// Skip thinking blocks, signatures, etc.
			}
		}
		// Skip system, summary, progress, etc.
	}

	return lines;
}

/**
 * Extract the first user message from raw session data.
 * Returns the text truncated to 200 characters, or null if none found.
 */
function extractFirstMessage(raw: string): string | null {
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		let entry: ClaudeEntry;
		try {
			entry = JSON.parse(line) as ClaudeEntry;
		} catch {
			continue;
		}
		if (entry.isMeta || entry.isSidechain) continue;
		if (entry.type !== "user") continue;

		const content = entry.message?.content;
		if (!content) continue;

		if (typeof content === "string") {
			const trimmed = content.trim();
			if (trimmed) return trimmed.slice(0, 200);
		} else if (Array.isArray(content)) {
			const hasToolResult = content.some((b) => b.type === "tool_result");
			if (hasToolResult) continue;
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
 * Extract the session name (slug) from a Claude Code session.
 * Claude Code stores the slug on "progress" entries.
 */
function extractSessionName(raw: string): string | null {
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line) as Record<string, unknown>;
			if (entry.type === "progress" && typeof entry.slug === "string") {
				return entry.slug;
			}
		} catch {}
	}
	return null;
}

export { extractClaudeCode, extractFirstMessage, extractSessionName };
