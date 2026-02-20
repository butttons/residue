import type { DataLayer } from "./lib/db";

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

type AppEnv = {
	Bindings: Env;
	Variables: {
		DL: DataLayer;
		username: string;
	};
};

export type { ToolCall, ThinkingBlock, Message, Mapper, AppEnv };
