import type { Mapper, Message, ThinkingBlock, ToolCall } from "@/types";

type PiEntry = {
	type: string;
	id?: string;
	parentId?: string | null;
	timestamp?: string;
	message?: PiMessage;
};

type PiContentBlock = {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
	data?: string;
	mimeType?: string;
};

type PiMessage = {
	role: string;
	content?: string | PiContentBlock[];
	model?: string;
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
	timestamp?: number;
};

const parseLines = (raw: string): PiEntry[] => {
	const entries: PiEntry[] = [];
	const lines = raw.trim().split("\n");

	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line) as PiEntry);
		} catch {
			// skip malformed lines
		}
	}

	return entries;
};

const getActiveBranch = (entries: PiEntry[]): PiEntry[] => {
	const messageEntries = entries.filter(
		(e) => e.type === "message" && e.id !== undefined,
	);

	if (messageEntries.length === 0) return [];

	// Build parent-to-children map to find the leaf
	const childrenOf = new Map<string, string[]>();
	const entryById = new Map<string, PiEntry>();

	for (const entry of messageEntries) {
		entryById.set(entry.id!, entry);
		const parentKey = entry.parentId ?? "__root__";
		const children = childrenOf.get(parentKey) ?? [];
		children.push(entry.id!);
		childrenOf.set(parentKey, children);
	}

	// Leaf = last entry that has no children
	let leafId: string | null = null;
	for (let i = messageEntries.length - 1; i >= 0; i--) {
		const id = messageEntries[i].id!;
		if (!childrenOf.has(id) || childrenOf.get(id)!.length === 0) {
			leafId = id;
			break;
		}
	}

	if (!leafId) return messageEntries;

	// Walk from leaf to root
	const branch: PiEntry[] = [];
	let currentId: string | null = leafId;
	while (currentId) {
		const entry = entryById.get(currentId);
		if (!entry) break;
		branch.push(entry);
		currentId = entry.parentId ?? null;
	}

	branch.reverse();
	return branch;
};

const extractTextContent = (
	content: string | PiContentBlock[] | undefined,
): string => {
	if (!content) return "";
	if (typeof content === "string") return content;

	return content
		.filter((b) => b.type === "text" && b.text)
		.map((b) => b.text!)
		.join("\n");
};

const extractThinking = (
	content: string | PiContentBlock[] | undefined,
): ThinkingBlock[] => {
	if (!content || typeof content === "string") return [];

	return content
		.filter((b) => b.type === "thinking" && b.thinking)
		.map((b) => ({ content: b.thinking! }));
};

const extractToolCalls = (
	content: string | PiContentBlock[] | undefined,
): ToolCall[] => {
	if (!content || typeof content === "string") return [];

	return content
		.filter((b) => b.type === "toolCall" && b.name)
		.map((b) => ({
			name: b.name!,
			input: b.arguments ? JSON.stringify(b.arguments, null, 2) : "",
			output: "",
		}));
};

const formatTimestamp = (ts: number | undefined): string | undefined => {
	if (!ts) return undefined;
	return new Date(ts).toISOString();
};

const piMapper: Mapper = (raw: string): Message[] => {
	if (!raw.trim()) return [];

	const entries = parseLines(raw);
	if (entries.length === 0) return [];

	const branch = getActiveBranch(entries);
	if (branch.length === 0) return [];

	const messages: Message[] = [];

	// Collect tool calls from assistant messages so we can match tool results
	// Key: toolCallId from toolCall content block, Value: reference to ToolCall in messages
	const pendingToolCalls = new Map<string, ToolCall>();

	for (const entry of branch) {
		const msg = entry.message;
		if (!msg) continue;

		if (msg.role === "user") {
			messages.push({
				role: "human",
				content: extractTextContent(msg.content),
				timestamp: formatTimestamp(msg.timestamp),
			});
		} else if (msg.role === "assistant") {
			const toolCalls = extractToolCalls(msg.content);
			const textContent = extractTextContent(msg.content);
			const thinkingBlocks = extractThinking(msg.content);

			// Register tool calls for later matching with tool results
			if (Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block.type === "toolCall" && block.id && block.name) {
						const tc = toolCalls.find((t) => t.name === block.name);
						if (tc) {
							pendingToolCalls.set(block.id, tc);
						}
					}
				}
			}

			const message: Message = {
				role: "assistant",
				content: textContent,
				timestamp: formatTimestamp(msg.timestamp),
				model: msg.model,
			};

			if (toolCalls.length > 0) {
				message.tool_calls = toolCalls;
			}

			if (thinkingBlocks.length > 0) {
				message.thinking = thinkingBlocks;
			}

			messages.push(message);
		} else if (msg.role === "toolResult") {
			const output = extractTextContent(msg.content);
			const toolCallId = msg.toolCallId;

			if (toolCallId && pendingToolCalls.has(toolCallId)) {
				const tc = pendingToolCalls.get(toolCallId)!;
				tc.output = output;
				pendingToolCalls.delete(toolCallId);
			}
		}
		// Skip other entry types (bashExecution, custom, branchSummary, compactionSummary, etc.)
	}

	return messages;
};

export { piMapper };
