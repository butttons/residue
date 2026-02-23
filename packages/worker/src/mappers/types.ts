/**
 * Copied from packages/adapter/src/types.ts
 * Only the types needed by the worker (Message, Mapper, and their dependencies).
 */

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

export type { ToolCall, ThinkingBlock, Message, Mapper };
