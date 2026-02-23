type ToolCall = {
	name: string;
	input: string;
	output: string;
};

type ThinkingBlock = {
	content: string;
};

type Message = {
	role: string;
	content: string;
	timestamp?: string;
	model?: string;
	tool_calls?: ToolCall[];
	thinking?: ThinkingBlock[];
};

type Mapper = (raw: string) => Message[];

type SearchLine = {
	role: "human" | "assistant" | "tool" | "files";
	text: string;
};

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

type MetadataExtractors = {
	extractFirstMessage: (raw: string) => string | null;
	extractSessionName: (raw: string) => string | null;
};

type ExtractorName = "claude-code" | "opencode" | "pi";

type TimestampRange = {
	firstMessageAt: number | null;
	lastMessageAt: number | null;
};

export type {
	ToolCall,
	ThinkingBlock,
	Message,
	Mapper,
	SearchLine,
	SearchTextMetadata,
	MetadataExtractors,
	ExtractorName,
	TimestampRange,
};
