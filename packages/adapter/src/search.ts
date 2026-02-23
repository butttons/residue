import {
	extractClaudeCode,
	extractFirstMessage as extractFirstMessageClaudeCode,
	extractSessionName as extractSessionNameClaudeCode,
} from "@/claude-code/search";
import {
	extractFirstMessage as extractFirstMessageOpencode,
	extractOpencode,
	extractSessionName as extractSessionNameOpencode,
} from "@/opencode/search";
import {
	extractFirstMessage as extractFirstMessagePi,
	extractPi,
	extractSessionName as extractSessionNamePi,
} from "@/pi/search";
import type {
	ExtractorName,
	MetadataExtractors,
	SearchLine,
	SearchTextMetadata,
} from "@/types";

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

export { buildSearchText, getExtractor, getMetadataExtractors };
