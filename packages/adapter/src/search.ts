import {
	extractClaudeCode,
	extractFirstMessage as extractFirstMessageClaudeCode,
	extractSessionName as extractSessionNameClaudeCode,
} from "./claude-code/search";
import { getMapper } from "./mappers";
import {
	extractFirstMessage as extractFirstMessageOpencode,
	extractOpencode,
	extractSessionName as extractSessionNameOpencode,
} from "./opencode/search";
import {
	extractFirstMessage as extractFirstMessagePi,
	extractPi,
	extractSessionName as extractSessionNamePi,
} from "./pi/search";
import type {
	ExtractorName,
	MetadataExtractors,
	SearchLine,
	SearchTextMetadata,
	TimestampRange,
} from "./types";

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

// -- Extractor registry ------------------------------------------------------

const extractors: Record<ExtractorName, (raw: string) => SearchLine[]> = {
	"claude-code": extractClaudeCode,
	opencode: extractOpencode,
	pi: extractPi,
};

function getExtractor(agent: string): ((raw: string) => SearchLine[]) | null {
	return extractors[agent as ExtractorName] ?? null;
}

// -- Metadata extractor registry ---------------------------------------------

const metadataExtractors: Record<ExtractorName, MetadataExtractors> = {
	"claude-code": {
		extractFirstMessage: extractFirstMessageClaudeCode,
		extractSessionName: extractSessionNameClaudeCode,
	},
	opencode: {
		extractFirstMessage: extractFirstMessageOpencode,
		extractSessionName: extractSessionNameOpencode,
	},
	pi: {
		extractFirstMessage: extractFirstMessagePi,
		extractSessionName: extractSessionNamePi,
	},
};

function getMetadataExtractors(agent: string): MetadataExtractors | null {
	return metadataExtractors[agent as ExtractorName] ?? null;
}

// -- Timestamp extraction ----------------------------------------------------

/**
 * Run the agent's mapper to get Message[], then extract the first and last
 * message timestamps as unix epoch seconds. Returns null for either value
 * if no valid timestamps are found.
 */
function extractTimestamps(opts: {
	agent: string;
	raw: string;
}): TimestampRange {
	const mapper = getMapper(opts.agent);
	if (!mapper) return { firstMessageAt: null, lastMessageAt: null };

	const messages = mapper(opts.raw);
	if (messages.length === 0)
		return { firstMessageAt: null, lastMessageAt: null };

	let firstMs: number | null = null;
	let lastMs: number | null = null;

	for (const msg of messages) {
		if (!msg.timestamp) continue;
		const ms = new Date(msg.timestamp).getTime();
		if (Number.isNaN(ms)) continue;

		if (firstMs === null || ms < firstMs) firstMs = ms;
		if (lastMs === null || ms > lastMs) lastMs = ms;
	}

	return {
		firstMessageAt: firstMs !== null ? Math.floor(firstMs / 1000) : null,
		lastMessageAt: lastMs !== null ? Math.floor(lastMs / 1000) : null,
	};
}

export {
	buildSearchText,
	extractTimestamps,
	getExtractor,
	getMetadataExtractors,
};
