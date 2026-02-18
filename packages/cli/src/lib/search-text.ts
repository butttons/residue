/**
 * Lightweight text extractors for search indexing.
 *
 * These are NOT full conversation mappers. They produce a simple text
 * representation optimized for embedding/search -- stripping thinking
 * blocks, token metadata, tool output, signatures, cache data, etc.
 */

type SearchTextMetadata = {
	sessionId: string;
	agent: string;
	commits: string[];
	branch: string;
	repo: string;
	dataPath?: string;
	firstMessage?: string;
	sessionName?: string;
};

type SearchLine = {
	role: "human" | "assistant" | "tool";
	text: string;
};

/**
 * Build the final search document from metadata + extracted lines.
 */
function buildSearchText(opts: {
	metadata: SearchTextMetadata;
	lines: SearchLine[];
}): string {
	const header = [
		`Session: ${opts.metadata.sessionId}`,
		`Agent: ${opts.metadata.agent}`,
		opts.metadata.commits.length > 0
			? `Commits: ${opts.metadata.commits.join(", ")}`
			: null,
		opts.metadata.branch ? `Branch: ${opts.metadata.branch}` : null,
		opts.metadata.repo ? `Repo: ${opts.metadata.repo}` : null,
		opts.metadata.dataPath ? `DataPath: ${opts.metadata.dataPath}` : null,
		opts.metadata.sessionName
			? `SessionName: ${opts.metadata.sessionName}`
			: null,
		opts.metadata.firstMessage
			? `FirstMessage: ${opts.metadata.firstMessage}`
			: null,
	]
		.filter(Boolean)
		.join("\n");

	const body = opts.lines
		.map((line) => `[${line.role}] ${line.text}`)
		.join("\n");

	return `${header}\n\n${body}\n`;
}

// -- Session metadata extractors ---------------------------------------------

/**
 * Extract the first user message from raw session data.
 * Returns the text truncated to 200 characters, or null if none found.
 */
function extractFirstMessageClaudeCode(raw: string): string | null {
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
function extractSessionNameClaudeCode(raw: string): string | null {
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

/**
 * Extract the first user message from a pi session.
 * Returns the text truncated to 200 characters, or null if none found.
 */
function extractFirstMessagePi(raw: string): string | null {
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
function extractSessionNamePi(raw: string): string | null {
	// Check custom entries for session-name
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

type MetadataExtractors = {
	extractFirstMessage: (raw: string) => string | null;
	extractSessionName: (raw: string) => string | null;
};

const metadataExtractors: Record<ExtractorName, MetadataExtractors> = {
	"claude-code": {
		extractFirstMessage: extractFirstMessageClaudeCode,
		extractSessionName: extractSessionNameClaudeCode,
	},
	pi: {
		extractFirstMessage: extractFirstMessagePi,
		extractSessionName: extractSessionNamePi,
	},
};

function getMetadataExtractors(agent: string): MetadataExtractors | null {
	return metadataExtractors[agent as ExtractorName] ?? null;
}

// -- Claude Code extractor --------------------------------------------------

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

// -- Pi extractor ------------------------------------------------------------

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

// -- Shared helpers ----------------------------------------------------------

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

// -- Public API --------------------------------------------------------------

type ExtractorName = "claude-code" | "pi";

const extractors: Record<ExtractorName, (raw: string) => SearchLine[]> = {
	"claude-code": extractClaudeCode,
	pi: extractPi,
};

function getExtractor(agent: string): ((raw: string) => SearchLine[]) | null {
	return extractors[agent as ExtractorName] ?? null;
}

export {
	buildSearchText,
	extractClaudeCode,
	extractPi,
	getExtractor,
	getMetadataExtractors,
	summarizeToolInput,
};
export type {
	SearchLine,
	SearchTextMetadata,
	ExtractorName,
	MetadataExtractors,
};
