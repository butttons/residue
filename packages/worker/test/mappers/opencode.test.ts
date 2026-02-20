import { describe, expect, it } from "vitest";
import { getMapper } from "../../src/mappers";
import { opencodeMapper } from "../../src/mappers/opencode";

const makeSession = (messages: Record<string, unknown>[]): string => {
	return JSON.stringify(messages);
};

const userMsg = (opts: {
	id?: string;
	text: string;
	time?: number;
}): Record<string, unknown> => ({
	info: {
		role: "user",
		id: opts.id ?? "msg_user_1",
		sessionID: "ses_test",
		time: { created: opts.time ?? 1700000000000 },
	},
	parts: [
		{
			id: "part_text_1",
			sessionID: "ses_test",
			messageID: opts.id ?? "msg_user_1",
			type: "text",
			text: opts.text,
		},
	],
});

const assistantMsg = (opts: {
	id?: string;
	text?: string;
	toolParts?: Record<string, unknown>[];
	reasoningParts?: Record<string, unknown>[];
	model?: string;
	time?: number;
}): Record<string, unknown> => {
	const msgId = opts.id ?? "msg_asst_1";
	const parts: Record<string, unknown>[] = [];

	if (opts.text) {
		parts.push({
			id: "part_text_1",
			sessionID: "ses_test",
			messageID: msgId,
			type: "text",
			text: opts.text,
		});
	}

	if (opts.toolParts) {
		parts.push(...opts.toolParts);
	}

	if (opts.reasoningParts) {
		parts.push(...opts.reasoningParts);
	}

	return {
		info: {
			role: "assistant",
			id: msgId,
			sessionID: "ses_test",
			time: { created: opts.time ?? 1700000001000 },
			modelID: opts.model ?? "claude-sonnet-4-5",
			providerID: "anthropic",
			cost: 0.01,
			tokens: {
				input: 100,
				output: 50,
				reasoning: 0,
				cache: { read: 0, write: 0 },
			},
		},
		parts,
	};
};

const toolPart = (opts: {
	name: string;
	status: string;
	input?: Record<string, unknown>;
	output?: string;
	error?: string;
}): Record<string, unknown> => {
	const state: Record<string, unknown> = {
		status: opts.status,
		input: opts.input ?? {},
	};

	if (opts.status === "completed") {
		state.output = opts.output ?? "";
		state.title = opts.name;
		state.metadata = {};
		state.time = { start: 1700000000000, end: 1700000001000 };
	} else if (opts.status === "error") {
		state.error = opts.error ?? "something failed";
		state.time = { start: 1700000000000, end: 1700000001000 };
	}

	return {
		id: `part_tool_${opts.name}`,
		sessionID: "ses_test",
		messageID: "msg_asst_1",
		type: "tool",
		tool: opts.name,
		callID: `call_${opts.name}`,
		state,
	};
};

describe("opencode mapper", () => {
	it("is registered in mapper registry", () => {
		const mapper = getMapper("opencode");
		expect(mapper).not.toBeNull();
		expect(mapper).toBe(opencodeMapper);
	});

	it("returns empty array for empty string", () => {
		expect(opencodeMapper("")).toEqual([]);
		expect(opencodeMapper("  ")).toEqual([]);
	});

	it("returns empty array for invalid JSON", () => {
		expect(opencodeMapper("not json")).toEqual([]);
		expect(opencodeMapper("{broken")).toEqual([]);
	});

	it("returns empty array for empty array", () => {
		expect(opencodeMapper("[]")).toEqual([]);
	});

	it("maps a simple user message", () => {
		const raw = makeSession([userMsg({ text: "hello" })]);
		const messages = opencodeMapper(raw);

		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("hello");
		expect(messages[0].timestamp).toBe("2023-11-14T22:13:20.000Z");
	});

	it("maps an assistant message with text and model", () => {
		const raw = makeSession([
			userMsg({ text: "hi" }),
			assistantMsg({ text: "Hello! How can I help?", model: "gpt-4o" }),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("Hello! How can I help?");
		expect(messages[1].model).toBe("gpt-4o");
	});

	it("maps assistant message with completed tool calls", () => {
		const raw = makeSession([
			userMsg({ text: "list files" }),
			assistantMsg({
				text: "Let me check.",
				toolParts: [
					toolPart({
						name: "bash",
						status: "completed",
						input: { command: "ls" },
						output: "file1.ts\nfile2.ts",
					}),
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[1].tool_calls![0].name).toBe("bash");
		expect(JSON.parse(messages[1].tool_calls![0].input)).toEqual({
			command: "ls",
		});
		expect(messages[1].tool_calls![0].output).toBe("file1.ts\nfile2.ts");
	});

	it("maps assistant message with error tool calls", () => {
		const raw = makeSession([
			userMsg({ text: "read file" }),
			assistantMsg({
				toolParts: [
					toolPart({
						name: "read",
						status: "error",
						input: { filePath: "missing.ts" },
						error: "File not found",
					}),
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls![0].output).toBe("Error: File not found");
	});

	it("maps assistant message with pending tool calls", () => {
		const raw = makeSession([
			userMsg({ text: "do something" }),
			assistantMsg({
				toolParts: [
					toolPart({
						name: "bash",
						status: "pending",
						input: { command: "echo hi" },
					}),
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls![0].output).toBe("");
	});

	it("captures reasoning blocks", () => {
		const raw = makeSession([
			userMsg({ text: "think about this" }),
			assistantMsg({
				text: "Here is my answer.",
				reasoningParts: [
					{
						id: "part_reason_1",
						sessionID: "ses_test",
						messageID: "msg_asst_1",
						type: "reasoning",
						text: "Let me think carefully...",
					},
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].thinking).toHaveLength(1);
		expect(messages[1].thinking![0].content).toBe("Let me think carefully...");
	});

	it("handles multiple tool calls in one message", () => {
		const raw = makeSession([
			userMsg({ text: "check everything" }),
			assistantMsg({
				toolParts: [
					toolPart({
						name: "read",
						status: "completed",
						input: { filePath: "a.ts" },
						output: "content a",
					}),
					toolPart({
						name: "bash",
						status: "completed",
						input: { command: "git status" },
						output: "clean",
					}),
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages[1].tool_calls).toHaveLength(2);
		expect(messages[1].tool_calls![0].name).toBe("read");
		expect(messages[1].tool_calls![1].name).toBe("bash");
	});

	it("skips user messages with no text parts", () => {
		const raw = makeSession([
			{
				info: {
					role: "user",
					id: "msg_1",
					sessionID: "ses_test",
					time: { created: 1700000000000 },
				},
				parts: [
					{
						id: "part_file_1",
						sessionID: "ses_test",
						messageID: "msg_1",
						type: "file",
						mime: "image/png",
						url: "data:image/png;base64,...",
					},
				],
			},
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(0);
	});

	it("joins multiple text parts with newline", () => {
		const raw = makeSession([
			{
				info: {
					role: "user",
					id: "msg_1",
					sessionID: "ses_test",
					time: { created: 1700000000000 },
				},
				parts: [
					{
						id: "p1",
						sessionID: "ses_test",
						messageID: "msg_1",
						type: "text",
						text: "part one",
					},
					{
						id: "p2",
						sessionID: "ses_test",
						messageID: "msg_1",
						type: "text",
						text: "part two",
					},
				],
			},
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("part one\npart two");
	});

	it("handles a multi-turn conversation with mixed part types", () => {
		const raw = makeSession([
			userMsg({ id: "msg_u1", text: "check the project setup" }),
			assistantMsg({
				id: "msg_a1",
				text: "Let me look at the project.",
				toolParts: [
					toolPart({
						name: "read",
						status: "completed",
						input: { filePath: "package.json" },
						output: '{"name": "test"}',
					}),
					toolPart({
						name: "glob",
						status: "completed",
						input: { pattern: "src/**/*.ts" },
						output: "src/index.ts\nsrc/app.ts",
					}),
				],
				reasoningParts: [
					{
						id: "part_r1",
						sessionID: "ses_test",
						messageID: "msg_a1",
						type: "reasoning",
						text: "I should check the project structure first.",
					},
				],
				model: "claude-sonnet-4-5",
			}),
			userMsg({ id: "msg_u2", text: "now write the AGENTS.md" }),
			assistantMsg({
				id: "msg_a2",
				text: "I will create the file.",
				toolParts: [
					toolPart({
						name: "write",
						status: "completed",
						input: { filePath: "AGENTS.md" },
						output: "File written successfully",
					}),
				],
			}),
		]);

		const messages = opencodeMapper(raw);
		expect(messages).toHaveLength(4);

		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("check the project setup");

		expect(messages[1].role).toBe("assistant");
		expect(messages[1].tool_calls).toHaveLength(2);
		expect(messages[1].thinking).toHaveLength(1);
		expect(messages[1].model).toBe("claude-sonnet-4-5");

		expect(messages[2].role).toBe("human");
		expect(messages[3].role).toBe("assistant");
		expect(messages[3].tool_calls).toHaveLength(1);
		expect(messages[3].tool_calls![0].name).toBe("write");
	});
});
