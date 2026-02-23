import type { Mapper, Message, ThinkingBlock, ToolCall } from "@/types";

type OpenCodeToolState =
	| {
			status: "completed";
			input: Record<string, unknown>;
			output: string;
			title: string;
			metadata: Record<string, unknown>;
			time: { start: number; end: number; compacted?: number };
	  }
	| {
			status: "error";
			input: Record<string, unknown>;
			error: string;
			time: { start: number; end: number };
	  }
	| {
			status: "pending" | "running";
			input: Record<string, unknown>;
	  };

type OpenCodePart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: string;
	// text part
	text?: string;
	// tool part
	tool?: string;
	callID?: string;
	state?: OpenCodeToolState;
	// reasoning part
	metadata?: Record<string, unknown>;
	// step-finish part
	cost?: number;
	tokens?: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
};

type OpenCodeUserInfo = {
	role: "user";
	id: string;
	sessionID: string;
	time: { created: number };
	model?: { providerID: string; modelID: string };
};

type OpenCodeAssistantInfo = {
	role: "assistant";
	id: string;
	sessionID: string;
	time: { created: number; completed?: number };
	modelID: string;
	providerID: string;
	cost: number;
	tokens?: {
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
};

type OpenCodeMessageInfo = OpenCodeUserInfo | OpenCodeAssistantInfo;

type OpenCodeWithParts = {
	info: OpenCodeMessageInfo;
	parts: OpenCodePart[];
};

const formatTimestamp = (ts: number | undefined): string | undefined => {
	if (!ts) return undefined;
	return new Date(ts).toISOString();
};

const extractTextContent = (parts: OpenCodePart[]): string => {
	return parts
		.filter((p) => p.type === "text" && p.text)
		.map((p) => p.text!)
		.join("\n");
};

const extractThinking = (parts: OpenCodePart[]): ThinkingBlock[] => {
	return parts
		.filter((p) => p.type === "reasoning" && p.text)
		.map((p) => ({ content: p.text! }));
};

const extractToolCalls = (parts: OpenCodePart[]): ToolCall[] => {
	return parts
		.filter((p) => p.type === "tool" && p.tool)
		.map((p) => {
			const state = p.state;
			let input = "";
			let output = "";

			if (state) {
				input = JSON.stringify(state.input ?? {}, null, 2);
				if (state.status === "completed") {
					output = state.output;
				} else if (state.status === "error") {
					output = `Error: ${state.error}`;
				}
			}

			return {
				name: p.tool!,
				input,
				output,
			};
		});
};

const opencodeMapper: Mapper = (raw: string): Message[] => {
	if (!raw.trim()) return [];

	let entries: OpenCodeWithParts[];
	try {
		entries = JSON.parse(raw) as OpenCodeWithParts[];
	} catch {
		return [];
	}

	if (!Array.isArray(entries) || entries.length === 0) return [];

	const messages: Message[] = [];

	for (const entry of entries) {
		const info = entry.info;
		const parts = entry.parts ?? [];

		if (info.role === "user") {
			const textContent = extractTextContent(parts);
			if (!textContent) continue;

			messages.push({
				role: "human",
				content: textContent,
				timestamp: formatTimestamp(info.time.created),
			});
		} else if (info.role === "assistant") {
			const textContent = extractTextContent(parts);
			const toolCalls = extractToolCalls(parts);
			const thinkingBlocks = extractThinking(parts);

			const message: Message = {
				role: "assistant",
				content: textContent,
				timestamp: formatTimestamp(info.time.created),
				model: info.modelID,
			};

			if (toolCalls.length > 0) {
				message.tool_calls = toolCalls;
			}

			if (thinkingBlocks.length > 0) {
				message.thinking = thinkingBlocks;
			}

			messages.push(message);
		}
	}

	return messages;
};

export { opencodeMapper };
