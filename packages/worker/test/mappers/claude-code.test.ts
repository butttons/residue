import { describe, expect, it } from "vitest";
import { claudeCodeMapper, getMapper } from "@/mappers";

const makeSession = (lines: Record<string, unknown>[]): string => {
	return lines.map((l) => JSON.stringify(l)).join("\n");
};

describe("claude code mapper", () => {
	it("is registered in mapper registry", () => {
		const mapper = getMapper("claude-code");
		expect(mapper).not.toBeNull();
		expect(mapper).toBe(claudeCodeMapper);
	});

	it("returns empty array for empty string", () => {
		expect(claudeCodeMapper("")).toEqual([]);
		expect(claudeCodeMapper("  ")).toEqual([]);
	});

	it("returns empty array for non-conversation entries only", () => {
		const raw = makeSession([
			{
				type: "file-history-snapshot",
				messageId: "m1",
				snapshot: { messageId: "m1", trackedFileBackups: {} },
			},
			{
				type: "system",
				subtype: "turn_duration",
				durationMs: 5000,
				uuid: "s1",
			},
			{
				type: "summary",
				summary: "test session",
				leafUuid: "l1",
			},
		]);
		expect(claudeCodeMapper(raw)).toEqual([]);
	});

	it("maps a user message with string content", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				timestamp: "2026-01-24T15:00:00.000Z",
				message: {
					role: "user",
					content: "hello world",
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("hello world");
		expect(messages[0].timestamp).toBe("2026-01-24T15:00:00.000Z");
	});

	it("maps an assistant message with text content", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: {
					role: "user",
					content: "hi",
				},
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				timestamp: "2026-01-24T15:00:01.000Z",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "text",
							text: "Hello! How can I help?",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("Hello! How can I help?");
		expect(messages[1].model).toBe("claude-sonnet-4-5-20250929");
	});

	it("merges multi-entry assistant turns (same message.id)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: {
					role: "user",
					content: "list files",
				},
			},
			// Entry 1: thinking block
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				timestamp: "2026-01-24T15:00:01.000Z",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "thinking",
							thinking: "The user wants to see files...",
						},
					],
				},
			},
			// Entry 2: text block (same msg id)
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "a1",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "text",
							text: "Let me check the directory.",
						},
					],
				},
			},
			// Entry 3: tool_use block (same msg id)
			{
				type: "assistant",
				uuid: "a3",
				parentUuid: "a2",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Bash",
							input: { command: "ls -la" },
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);

		const assistant = messages[1];
		expect(assistant.role).toBe("assistant");
		expect(assistant.content).toBe("Let me check the directory.");
		expect(assistant.model).toBe("claude-sonnet-4-5-20250929");
		expect(assistant.tool_calls).toHaveLength(1);
		expect(assistant.tool_calls![0].name).toBe("Bash");
		expect(JSON.parse(assistant.tool_calls![0].input)).toEqual({
			command: "ls -la",
		});
	});

	it("matches tool_result back to tool_use", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "check files" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Bash",
							input: { command: "ls" },
						},
					],
				},
			},
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "file1.ts\nfile2.ts",
							is_error: false,
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].tool_calls![0].output).toBe("file1.ts\nfile2.ts");
	});

	it("marks error tool results", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "run something" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Bash",
							input: { command: "exit 1" },
						},
					],
				},
			},
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "command failed",
							is_error: true,
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages[1].tool_calls![0].output).toBe("[ERROR] command failed");
	});

	it("handles multiple tool calls across turns", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "do both" },
			},
			// First assistant turn with tool_use
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Bash",
							input: { command: "ls" },
						},
					],
				},
			},
			// Tool result
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "file1.ts",
						},
					],
				},
			},
			// Second assistant turn with another tool
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "u2",
				message: {
					id: "msg_002",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_002",
							name: "Read",
							input: { file_path: "file1.ts" },
						},
					],
				},
			},
			// Tool result
			{
				type: "user",
				uuid: "u3",
				parentUuid: "a2",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_002",
							content: "const x = 1;",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		// user + assistant (tool1) + assistant (tool2)
		expect(messages).toHaveLength(3);
		expect(messages[1].tool_calls![0].name).toBe("Bash");
		expect(messages[1].tool_calls![0].output).toBe("file1.ts");
		expect(messages[2].tool_calls![0].name).toBe("Read");
		expect(messages[2].tool_calls![0].output).toBe("const x = 1;");
	});

	it("skips isMeta user entries", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Skill",
							input: { skill: "brainstorming" },
						},
					],
				},
			},
			// tool_result
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "Launching skill: brainstorming",
						},
					],
				},
			},
			// Meta entry (auto-injected skill content)
			{
				type: "user",
				uuid: "u3",
				parentUuid: "u2",
				isMeta: true,
				message: {
					role: "user",
					content: [
						{
							type: "text",
							text: "# Brainstorming Skill\n\nThis is injected content...",
						},
					],
				},
			},
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "u3",
				message: {
					id: "msg_002",
					role: "assistant",
					content: [
						{
							type: "text",
							text: "Got it, using brainstorming approach.",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		// Should have: human "hello", assistant (tool Skill), assistant "Got it..."
		// The meta entry should be skipped
		const humanMessages = messages.filter((m) => m.role === "human");
		expect(humanMessages).toHaveLength(1);
		expect(humanMessages[0].content).toBe("hello");
	});

	it("skips isSidechain entries", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "main thread" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "response" }],
				},
			},
			// Sidechain entries
			{
				type: "user",
				uuid: "s1",
				parentUuid: "u1",
				isSidechain: true,
				message: { role: "user", content: "sidechain message" },
			},
			{
				type: "assistant",
				uuid: "s2",
				parentUuid: "s1",
				isSidechain: true,
				message: {
					id: "msg_side",
					role: "assistant",
					content: [{ type: "text", text: "sidechain response" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[0].content).toBe("main thread");
		expect(messages[1].content).toBe("response");
	});

	it("captures thinking blocks from assistant content", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "think about this" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "thinking",
							thinking: "Deep internal reasoning...",
							signature: "sig123",
						},
					],
				},
			},
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "a1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "text",
							text: "Here is my answer.",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[1].content).toBe("Here is my answer.");
		// Thinking should not appear in content but should be in thinking blocks
		expect(messages[1].content).not.toContain("Deep internal reasoning");
		expect(messages[1].thinking).toHaveLength(1);
		expect(messages[1].thinking![0].content).toBe("Deep internal reasoning...");
	});

	it("handles assistant turn with only thinking (no text or tool)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "question" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "thinking",
							thinking: "Only thinking, no output yet...",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		// The assistant message should still be emitted (with empty content but thinking captured)
		expect(messages).toHaveLength(2);
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("");
		expect(messages[1].thinking).toHaveLength(1);
		expect(messages[1].thinking![0].content).toBe(
			"Only thinking, no output yet...",
		);
	});

	it("handles user entries with text content blocks (non-meta)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: {
					role: "user",
					content: [
						{
							type: "text",
							text: "Here is my question with context.",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("Here is my question with context.");
	});

	it("follows the active branch (tree structure)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "original question" },
			},
			// First response
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "first answer" }],
				},
			},
			// User retries -> branches from u1
			{
				type: "user",
				uuid: "u2",
				parentUuid: "u1",
				message: { role: "user", content: "try again" },
			},
			// New response on the retry branch
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "u2",
				message: {
					id: "msg_002",
					role: "assistant",
					content: [{ type: "text", text: "second answer" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		// Active branch should be: u1 -> u2 -> a2 (a2 is the leaf)
		expect(messages).toHaveLength(3);
		expect(messages[0].content).toBe("original question");
		expect(messages[1].content).toBe("try again");
		expect(messages[2].content).toBe("second answer");
	});

	it("handles malformed JSON lines gracefully", () => {
		const raw = [
			JSON.stringify({
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			}),
			"not valid json {{{",
			"",
			JSON.stringify({
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "hi" }],
				},
			}),
		].join("\n");

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		expect(messages[0].content).toBe("hello");
		expect(messages[1].content).toBe("hi");
	});

	it("handles Write tool with file content", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "create a file" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Write",
							input: {
								file_path: "/path/to/file.ts",
								content: "const x = 1;\nconst y = 2;",
							},
						},
					],
				},
			},
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "File created successfully at: /path/to/file.ts",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
		const tc = messages[1].tool_calls![0];
		expect(tc.name).toBe("Write");
		expect(tc.output).toBe("File created successfully at: /path/to/file.ts");
		const parsedInput = JSON.parse(tc.input);
		expect(parsedInput.file_path).toBe("/path/to/file.ts");
		expect(parsedInput.content).toBe("const x = 1;\nconst y = 2;");
	});

	it("handles a full conversation flow", () => {
		const raw = makeSession([
			// User asks a question
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				timestamp: "2026-01-24T15:00:00.000Z",
				message: { role: "user", content: "Build a hello world CLI" },
			},
			// Assistant thinks then responds with text
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				timestamp: "2026-01-24T15:00:01.000Z",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{ type: "thinking", thinking: "I need to create a simple CLI." },
					],
				},
			},
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "a1",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "text",
							text: "I'll create a hello world CLI for you.",
						},
					],
				},
			},
			{
				type: "assistant",
				uuid: "a3",
				parentUuid: "a2",
				message: {
					id: "msg_001",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Write",
							input: {
								file_path: "hello.ts",
								content: 'console.log("hello world");',
							},
						},
					],
				},
			},
			// Tool result
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a3",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "File created successfully at: hello.ts",
						},
					],
				},
			},
			// System entry (should be skipped)
			{
				type: "system",
				uuid: "sys1",
				subtype: "turn_duration",
				durationMs: 3000,
			},
			// Assistant continues
			{
				type: "assistant",
				uuid: "a4",
				parentUuid: "u2",
				timestamp: "2026-01-24T15:00:05.000Z",
				message: {
					id: "msg_002",
					role: "assistant",
					model: "claude-sonnet-4-5-20250929",
					content: [
						{
							type: "text",
							text: "Done! Run it with `bun hello.ts`.",
						},
					],
				},
			},
			// Summary (should be skipped)
			{
				type: "summary",
				summary: "Created hello world CLI",
				leafUuid: "a4",
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(3);

		// Message 1: human
		expect(messages[0].role).toBe("human");
		expect(messages[0].content).toBe("Build a hello world CLI");

		// Message 2: assistant (merged turn with thinking + text + tool)
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toBe("I'll create a hello world CLI for you.");
		expect(messages[1].model).toBe("claude-sonnet-4-5-20250929");
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[1].tool_calls![0].name).toBe("Write");
		expect(messages[1].tool_calls![0].output).toBe(
			"File created successfully at: hello.ts",
		);

		// Message 3: assistant (new turn)
		expect(messages[2].role).toBe("assistant");
		expect(messages[2].content).toBe("Done! Run it with `bun hello.ts`.");
	});

	it("handles entries without uuid (gracefully skips them)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			},
			// Progress entry (no uuid/parentUuid)
			{
				type: "progress",
				content: { type: "tool_queued" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "hi" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
	});

	it("handles entries without message field", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			},
			// User entry with no message
			{
				type: "user",
				uuid: "u_no_msg",
				parentUuid: "u1",
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "hi" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(2);
	});

	it("handles assistant entries without message.id (merged as same turn)", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "response one" }],
				},
			},
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "response two" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		// Both have undefined message.id, so they get merged into one turn
		expect(messages).toHaveLength(2);
		expect(messages[1].content).toBe("response one\nresponse two");
	});

	it("separates assistant entries with different message.ids", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "hello" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [{ type: "text", text: "first turn" }],
				},
			},
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: { role: "user", content: "follow up" },
			},
			{
				type: "assistant",
				uuid: "a2",
				parentUuid: "u2",
				message: {
					id: "msg_002",
					role: "assistant",
					content: [{ type: "text", text: "second turn" }],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages).toHaveLength(4);
		expect(messages[1].content).toBe("first turn");
		expect(messages[3].content).toBe("second turn");
	});

	it("handles tool_result with empty content", () => {
		const raw = makeSession([
			{
				type: "user",
				uuid: "u1",
				parentUuid: "root",
				message: { role: "user", content: "do something" },
			},
			{
				type: "assistant",
				uuid: "a1",
				parentUuid: "u1",
				message: {
					id: "msg_001",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_001",
							name: "Bash",
							input: { command: "echo" },
						},
					],
				},
			},
			{
				type: "user",
				uuid: "u2",
				parentUuid: "a1",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_001",
							content: "",
						},
					],
				},
			},
		]);

		const messages = claudeCodeMapper(raw);
		expect(messages[1].tool_calls![0].output).toBe("");
	});
});
