import { describe, expect, it } from "vitest";
import { getMapper } from "../../src/mappers";
import { piMapper } from "../../src/mappers/pi";

const makeSession = (lines: Record<string, unknown>[]): string => {
	return lines.map((l) => JSON.stringify(l)).join("\n");
};

const header = {
	type: "session",
	version: 3,
	id: "test-session",
	timestamp: "2025-01-01T00:00:00.000Z",
	cwd: "/test",
};

describe("pi mapper", () => {
	it("is registered in mapper registry", () => {
		const mapper = getMapper("pi");
		expect(mapper).not.toBeNull();
		expect(mapper).toBe(piMapper);
	});

	it("returns empty array for empty string", () => {
		expect(piMapper("")).toEqual([]);
		expect(piMapper("  ")).toEqual([]);
	});

	it("returns empty array for header-only session", () => {
		const raw = makeSession([header]);
		expect(piMapper(raw)).toEqual([]);
	});

	it("maps a simple user message", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				timestamp: "2025-01-01T00:00:01.000Z",
				message: {
					role: "user",
					content: [{ type: "text", text: "hello" }],
					timestamp: 1735689601000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("hello");
		expect(messages[0].timestamp).toBe("2025-01-01T00:00:01.000Z");
	});

	it("maps user message with string content", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "plain text",
					timestamp: 1735689601000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("plain text");
	});

	it("maps assistant message with text and model", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "hi",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Hello! How can I help?" }],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("Hello! How can I help?");
		expect(messages[1].model).toBe("claude-sonnet-4-5");
	});

	it("maps assistant message with tool calls", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "list files",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "Let me check." },
						{
							type: "toolCall",
							id: "call_1",
							name: "bash",
							arguments: { command: "ls" },
						},
					],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[1].tool_calls![0].name).toBe("bash");
		expect(JSON.parse(messages[1].tool_calls![0].input)).toEqual({
			command: "ls",
		});
		expect(messages[1].tool_calls![0].output).toBe("");
	});

	it("matches tool results back to tool calls", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "list files",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "call_1",
							name: "bash",
							arguments: { command: "ls" },
						},
					],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
			{
				type: "message",
				id: "c1",
				parentId: "b1",
				message: {
					role: "toolResult",
					toolCallId: "call_1",
					toolName: "bash",
					content: [{ type: "text", text: "file1.ts\nfile2.ts" }],
					isError: false,
					timestamp: 1735689603000,
				},
			},
		]);

		const messages = piMapper(raw);
		// toolResult does not produce its own message, it fills in the tool call output
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls![0].output).toBe("file1.ts\nfile2.ts");
	});

	it("handles multiple tool calls in one assistant message", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "check status",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "call_1",
							name: "bash",
							arguments: { command: "git status" },
						},
						{
							type: "toolCall",
							id: "call_2",
							name: "read",
							arguments: { path: "README.md" },
						},
					],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
			{
				type: "message",
				id: "c1",
				parentId: "b1",
				message: {
					role: "toolResult",
					toolCallId: "call_1",
					toolName: "bash",
					content: [{ type: "text", text: "clean" }],
					isError: false,
					timestamp: 1735689603000,
				},
			},
			{
				type: "message",
				id: "c2",
				parentId: "c1",
				message: {
					role: "toolResult",
					toolCallId: "call_2",
					toolName: "read",
					content: [{ type: "text", text: "# My Project" }],
					isError: false,
					timestamp: 1735689604000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls).toHaveLength(2);
		expect(messages[1].tool_calls![0].output).toBe("clean");
		expect(messages[1].tool_calls![1].output).toBe("# My Project");
	});

	it("follows the active branch in a tree with branches", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "first question",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "first answer" }],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
			// Branch: different follow-up from same parent a1
			{
				type: "message",
				id: "b2",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "alternate answer" }],
					model: "claude-sonnet-4-5",
					timestamp: 1735689603000,
				},
			},
			// Continue on the branch b2
			{
				type: "message",
				id: "c1",
				parentId: "b2",
				message: {
					role: "user",
					content: "follow up on branch",
					timestamp: 1735689604000,
				},
			},
		]);

		const messages = piMapper(raw);
		// Active branch: a1 -> b2 -> c1 (b2/c1 are later, c1 is the leaf)
		expect(messages).toHaveLength(3);
		expect(messages[0].content).toBe("first question");
		expect(messages[1].content).toBe("alternate answer");
		expect(messages[2].content).toBe("follow up on branch");
	});

	it("skips non-message entries", () => {
		const raw = makeSession([
			header,
			{
				type: "thinking_level_change",
				id: "t1",
				parentId: null,
				thinkingLevel: "high",
			},
			{
				type: "message",
				id: "a1",
				parentId: "t1",
				message: {
					role: "user",
					content: "hello",
					timestamp: 1735689601000,
				},
			},
			{
				type: "model_change",
				id: "m1",
				parentId: "a1",
				provider: "anthropic",
				modelId: "claude-opus-4",
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "hi" }],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe("human");
		expect(messages[1].role).toBe("assistant");
	});

	it("skips malformed JSON lines gracefully", () => {
		const raw = [
			JSON.stringify(header),
			"not valid json {{{",
			JSON.stringify({
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "hello",
					timestamp: 1735689601000,
				},
			}),
		].join("\n");

		const messages = piMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("hello");
	});

	it("captures thinking blocks from assistant content", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: "think about this",
					timestamp: 1735689601000,
				},
			},
			{
				type: "message",
				id: "b1",
				parentId: "a1",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "deep thoughts" },
						{
							type: "toolCall",
							id: "call_1",
							name: "bash",
							arguments: { command: "echo hi" },
						},
					],
					model: "claude-sonnet-4-5",
					timestamp: 1735689602000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].content).toBe("");
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[1].thinking).toHaveLength(1);
		expect(messages[1].thinking![0].content).toBe("deep thoughts");
	});

	it("joins multiple text blocks with newline", () => {
		const raw = makeSession([
			header,
			{
				type: "message",
				id: "a1",
				parentId: null,
				message: {
					role: "user",
					content: [
						{ type: "text", text: "part one" },
						{ type: "text", text: "part two" },
					],
					timestamp: 1735689601000,
				},
			},
		]);

		const messages = piMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].content).toBe("part one\npart two");
	});
});
