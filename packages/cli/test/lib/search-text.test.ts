import { describe, expect, test } from "bun:test";
import { extractClaudeCode } from "@residue/adapter/claude-code";
import { extractOpencode } from "@residue/adapter/opencode";
import { extractPi } from "@residue/adapter/pi";
import {
	buildSearchText,
	getExtractor,
	getMetadataExtractors,
} from "@residue/adapter/search";
import { summarizeToolInput } from "@residue/adapter/shared";

describe("search text extractors", () => {
	describe("extractClaudeCode", () => {
		test("extracts human and assistant messages from JSONL", () => {
			const raw = [
				JSON.stringify({
					type: "user",
					message: { role: "user", content: "fix the auth redirect" },
				}),
				JSON.stringify({
					type: "assistant",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "I will update the middleware." }],
					},
				}),
			].join("\n");

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(2);
			expect(lines[0]).toEqual({
				role: "human",
				text: "fix the auth redirect",
			});
			expect(lines[1]).toEqual({
				role: "assistant",
				text: "I will update the middleware.",
			});
		});

		test("extracts tool_use as tool lines with file path", () => {
			const raw = JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [
						{
							type: "tool_use",
							name: "edit",
							input: { path: "src/auth.ts" },
						},
					],
				},
			});

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({ role: "tool", text: "edit src/auth.ts" });
		});

		test("skips thinking blocks", () => {
			const raw = JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [
						{
							type: "thinking",
							thinking: "Let me think about this...",
							signature: "abc123",
						},
						{ type: "text", text: "Here is my answer." },
					],
				},
			});

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0].role).toBe("assistant");
			expect(lines[0].text).toBe("Here is my answer.");
		});

		test("skips meta entries", () => {
			const raw = [
				JSON.stringify({
					type: "user",
					isMeta: true,
					message: { role: "user", content: "auto-injected system stuff" },
				}),
				JSON.stringify({
					type: "user",
					message: { role: "user", content: "real user message" },
				}),
			].join("\n");

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0].text).toBe("real user message");
		});

		test("skips sidechain entries", () => {
			const raw = JSON.stringify({
				type: "assistant",
				isSidechain: true,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "sidechain response" }],
				},
			});

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(0);
		});

		test("skips tool_result user entries", () => {
			const raw = JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "abc",
							content: "some output",
						},
					],
				},
			});

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(0);
		});

		test("skips system and summary entries", () => {
			const raw = [
				JSON.stringify({ type: "system", message: { content: "init" } }),
				JSON.stringify({ type: "summary", summary: "something" }),
				JSON.stringify({ type: "progress" }),
			].join("\n");

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(0);
		});

		test("handles empty input", () => {
			expect(extractClaudeCode("")).toHaveLength(0);
			expect(extractClaudeCode("  \n  ")).toHaveLength(0);
		});

		test("handles malformed JSON lines gracefully", () => {
			const raw = [
				"not json at all",
				JSON.stringify({
					type: "user",
					message: { content: "valid line" },
				}),
				"{ broken json",
			].join("\n");

			const lines = extractClaudeCode(raw);
			expect(lines).toHaveLength(1);
		});
	});

	describe("extractPi", () => {
		test("extracts human and assistant messages", () => {
			const raw = [
				JSON.stringify({
					type: "message",
					message: { role: "user", content: "add a search feature" },
				}),
				JSON.stringify({
					type: "message",
					message: {
						role: "assistant",
						content: [
							{ type: "text", text: "I will add the search endpoint." },
						],
					},
				}),
			].join("\n");

			const lines = extractPi(raw);
			expect(lines).toHaveLength(2);
			expect(lines[0]).toEqual({
				role: "human",
				text: "add a search feature",
			});
			expect(lines[1]).toEqual({
				role: "assistant",
				text: "I will add the search endpoint.",
			});
		});

		test("extracts toolCall blocks", () => {
			const raw = JSON.stringify({
				type: "message",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							name: "bash",
							arguments: { command: "git diff --staged" },
						},
					],
				},
			});

			const lines = extractPi(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({
				role: "tool",
				text: "bash git diff --staged",
			});
		});

		test("skips non-message entry types", () => {
			const raw = [
				JSON.stringify({ type: "session", message: {} }),
				JSON.stringify({ type: "compaction" }),
				JSON.stringify({
					type: "message",
					message: { role: "user", content: "hello" },
				}),
			].join("\n");

			const lines = extractPi(raw);
			expect(lines).toHaveLength(1);
		});

		test("skips toolResult entries", () => {
			const raw = JSON.stringify({
				type: "message",
				message: {
					role: "toolResult",
					content: "some output text",
				},
			});

			const lines = extractPi(raw);
			expect(lines).toHaveLength(0);
		});

		test("handles assistant string content", () => {
			const raw = JSON.stringify({
				type: "message",
				message: {
					role: "assistant",
					content: "simple string response",
				},
			});

			const lines = extractPi(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({
				role: "assistant",
				text: "simple string response",
			});
		});

		test("handles empty input", () => {
			expect(extractPi("")).toHaveLength(0);
		});
	});

	describe("extractOpencode", () => {
		test("extracts human and assistant messages", () => {
			const raw = JSON.stringify([
				{
					info: {
						role: "user",
						id: "m1",
						sessionID: "s1",
						time: { created: 1700000000000 },
					},
					parts: [
						{
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							type: "text",
							text: "fix the auth bug",
						},
					],
				},
				{
					info: {
						role: "assistant",
						id: "m2",
						sessionID: "s1",
						time: { created: 1700000001000 },
						modelID: "claude-sonnet-4-5",
						providerID: "anthropic",
						cost: 0.01,
						tokens: {
							input: 100,
							output: 50,
							reasoning: 0,
							cache: { read: 0, write: 0 },
						},
					},
					parts: [
						{
							id: "p2",
							sessionID: "s1",
							messageID: "m2",
							type: "text",
							text: "I will update the middleware.",
						},
					],
				},
			]);

			const lines = extractOpencode(raw);
			expect(lines).toHaveLength(2);
			expect(lines[0]).toEqual({ role: "human", text: "fix the auth bug" });
			expect(lines[1]).toEqual({
				role: "assistant",
				text: "I will update the middleware.",
			});
		});

		test("extracts tool parts with input summary", () => {
			const raw = JSON.stringify([
				{
					info: {
						role: "assistant",
						id: "m1",
						sessionID: "s1",
						time: { created: 1700000000000 },
						modelID: "claude-sonnet-4-5",
						providerID: "anthropic",
						cost: 0.01,
						tokens: {
							input: 100,
							output: 50,
							reasoning: 0,
							cache: { read: 0, write: 0 },
						},
					},
					parts: [
						{
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							type: "tool",
							tool: "read",
							state: {
								status: "completed",
								input: { filePath: "src/auth.ts" },
								output: "file contents",
								title: "read",
								metadata: {},
								time: { start: 0, end: 1 },
							},
						},
					],
				},
			]);

			const lines = extractOpencode(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({ role: "tool", text: "read src/auth.ts" });
		});

		test("skips reasoning, step-start, step-finish, snapshot, patch parts", () => {
			const raw = JSON.stringify([
				{
					info: {
						role: "assistant",
						id: "m1",
						sessionID: "s1",
						time: { created: 1700000000000 },
						modelID: "model",
						providerID: "p",
						cost: 0,
						tokens: {
							input: 0,
							output: 0,
							reasoning: 0,
							cache: { read: 0, write: 0 },
						},
					},
					parts: [
						{
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							type: "reasoning",
							text: "thinking...",
						},
						{ id: "p2", sessionID: "s1", messageID: "m1", type: "step-start" },
						{
							id: "p3",
							sessionID: "s1",
							messageID: "m1",
							type: "step-finish",
							cost: 0.01,
						},
						{
							id: "p4",
							sessionID: "s1",
							messageID: "m1",
							type: "text",
							text: "actual response",
						},
					],
				},
			]);

			const lines = extractOpencode(raw);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toEqual({ role: "assistant", text: "actual response" });
		});

		test("handles empty input", () => {
			expect(extractOpencode("")).toHaveLength(0);
			expect(extractOpencode("  ")).toHaveLength(0);
		});

		test("handles invalid JSON", () => {
			expect(extractOpencode("not json")).toHaveLength(0);
		});

		test("handles empty array", () => {
			expect(extractOpencode("[]")).toHaveLength(0);
		});
	});

	describe("summarizeToolInput", () => {
		test("returns tool name when no input", () => {
			expect(summarizeToolInput("read", undefined)).toBe("read");
		});

		test("extracts path from input", () => {
			expect(summarizeToolInput("edit", { path: "src/index.ts" })).toBe(
				"edit src/index.ts",
			);
		});

		test("extracts file_path variant", () => {
			expect(summarizeToolInput("read", { file_path: "README.md" })).toBe(
				"read README.md",
			);
		});

		test("extracts command from input", () => {
			expect(summarizeToolInput("bash", { command: "ls -la" })).toBe(
				"bash ls -la",
			);
		});

		test("truncates long commands", () => {
			const longCmd = "a".repeat(200);
			const result = summarizeToolInput("bash", { command: longCmd });
			expect(result.length).toBeLessThan(200);
			expect(result).toContain("...");
		});

		test("extracts query from input", () => {
			expect(summarizeToolInput("search", { query: "auth middleware" })).toBe(
				"search auth middleware",
			);
		});

		test("falls back to tool name for unknown input shape", () => {
			expect(summarizeToolInput("custom_tool", { foo: 42, bar: true })).toBe(
				"custom_tool",
			);
		});
	});

	describe("getExtractor", () => {
		test("returns extractor for claude-code", () => {
			expect(getExtractor("claude-code")).not.toBeNull();
		});

		test("returns extractor for opencode", () => {
			expect(getExtractor("opencode")).not.toBeNull();
		});

		test("returns extractor for pi", () => {
			expect(getExtractor("pi")).not.toBeNull();
		});

		test("returns null for unknown agent", () => {
			expect(getExtractor("unknown-agent")).toBeNull();
		});
	});

	describe("buildSearchText", () => {
		test("builds header + body from metadata and lines", () => {
			const result = buildSearchText({
				metadata: {
					sessionId: "abc-123",
					agent: "claude-code",
					commits: ["abc1234", "def5678"],
					branch: "feature-auth",
					repo: "my-team/my-app",
				},
				lines: [
					{ role: "human", text: "fix the bug" },
					{ role: "assistant", text: "I will fix it." },
					{ role: "tool", text: "edit src/fix.ts" },
				],
			});

			expect(result).toContain("Session: abc-123");
			expect(result).toContain("Agent: claude-code");
			expect(result).toContain("Commits: abc1234, def5678");
			expect(result).toContain("Branch: feature-auth");
			expect(result).toContain("Repo: my-team/my-app");
			expect(result).toContain("[human] fix the bug");
			expect(result).toContain("[assistant] I will fix it.");
			expect(result).toContain("[tool] edit src/fix.ts");
		});

		test("omits empty metadata fields", () => {
			const result = buildSearchText({
				metadata: {
					sessionId: "abc",
					agent: "pi",
					commits: [],
					branch: "",
					repo: "",
				},
				lines: [{ role: "human", text: "hello" }],
			});

			expect(result).not.toContain("Commits:");
			expect(result).not.toContain("Branch:");
			expect(result).not.toContain("Repo:");
		});

		test("includes dataPath, sessionName, firstMessage in header", () => {
			const result = buildSearchText({
				metadata: {
					sessionId: "abc-123",
					agent: "pi",
					commits: [],
					branch: "",
					repo: "",
					dataPath: "/home/user/.pi/agent/sessions/foo/bar.jsonl",
					sessionName: "refactor auth",
					firstMessage: "fix the login redirect bug",
				},
				lines: [{ role: "human", text: "fix the login redirect bug" }],
			});

			expect(result).toContain(
				"DataPath: /home/user/.pi/agent/sessions/foo/bar.jsonl",
			);
			expect(result).toContain("SessionName: refactor auth");
			expect(result).toContain("FirstMessage: fix the login redirect bug");
		});

		test("omits dataPath, sessionName, firstMessage when absent", () => {
			const result = buildSearchText({
				metadata: {
					sessionId: "abc",
					agent: "pi",
					commits: [],
					branch: "",
					repo: "",
				},
				lines: [{ role: "human", text: "hello" }],
			});

			expect(result).not.toContain("DataPath:");
			expect(result).not.toContain("SessionName:");
			expect(result).not.toContain("FirstMessage:");
		});
	});

	describe("getMetadataExtractors", () => {
		test("returns extractors for claude-code", () => {
			const ext = getMetadataExtractors("claude-code");
			expect(ext).not.toBeNull();
			expect(ext!.extractFirstMessage).toBeFunction();
			expect(ext!.extractSessionName).toBeFunction();
		});

		test("returns extractors for opencode", () => {
			const ext = getMetadataExtractors("opencode");
			expect(ext).not.toBeNull();
			expect(ext!.extractFirstMessage).toBeFunction();
			expect(ext!.extractSessionName).toBeFunction();
		});

		test("returns extractors for pi", () => {
			const ext = getMetadataExtractors("pi");
			expect(ext).not.toBeNull();
			expect(ext!.extractFirstMessage).toBeFunction();
			expect(ext!.extractSessionName).toBeFunction();
		});

		test("returns null for unknown agent", () => {
			expect(getMetadataExtractors("unknown")).toBeNull();
		});

		describe("claude-code", () => {
			const ext = getMetadataExtractors("claude-code")!;

			test("extractFirstMessage returns first non-meta user message", () => {
				const raw = [
					JSON.stringify({
						type: "user",
						isMeta: true,
						message: { role: "user", content: "system injected" },
					}),
					JSON.stringify({
						type: "user",
						message: { role: "user", content: "fix the auth redirect" },
					}),
					JSON.stringify({
						type: "user",
						message: { role: "user", content: "second message" },
					}),
				].join("\n");

				expect(ext.extractFirstMessage(raw)).toBe("fix the auth redirect");
			});

			test("extractFirstMessage returns null for empty session", () => {
				expect(ext.extractFirstMessage("")).toBeNull();
			});

			test("extractFirstMessage truncates long messages to 200 chars", () => {
				const longMsg = "a".repeat(300);
				const raw = JSON.stringify({
					type: "user",
					message: { role: "user", content: longMsg },
				});

				const result = ext.extractFirstMessage(raw);
				expect(result).not.toBeNull();
				expect(result!.length).toBe(200);
			});

			test("extractFirstMessage skips tool_result entries", () => {
				const raw = [
					JSON.stringify({
						type: "user",
						message: {
							role: "user",
							content: [
								{ type: "tool_result", tool_use_id: "abc", content: "output" },
							],
						},
					}),
					JSON.stringify({
						type: "user",
						message: { role: "user", content: "real message" },
					}),
				].join("\n");

				expect(ext.extractFirstMessage(raw)).toBe("real message");
			});

			test("extractSessionName returns slug from progress entry", () => {
				const raw = [
					JSON.stringify({ type: "file-history-snapshot", snapshot: {} }),
					JSON.stringify({
						type: "progress",
						slug: "graceful-floating-grove",
						sessionId: "abc",
					}),
					JSON.stringify({
						type: "user",
						message: { role: "user", content: "hello" },
					}),
				].join("\n");

				expect(ext.extractSessionName(raw)).toBe("graceful-floating-grove");
			});

			test("extractSessionName returns null when no slug", () => {
				const raw = JSON.stringify({
					type: "user",
					message: { role: "user", content: "hello" },
				});

				expect(ext.extractSessionName(raw)).toBeNull();
			});
		});

		describe("pi", () => {
			const ext = getMetadataExtractors("pi")!;

			test("extractFirstMessage returns first user message", () => {
				const raw = [
					JSON.stringify({
						type: "session",
						id: "abc",
						timestamp: "2026-01-01T00:00:00Z",
					}),
					JSON.stringify({
						type: "message",
						message: { role: "user", content: "add a search feature" },
					}),
					JSON.stringify({
						type: "message",
						message: { role: "user", content: "second prompt" },
					}),
				].join("\n");

				expect(ext.extractFirstMessage(raw)).toBe("add a search feature");
			});

			test("extractFirstMessage handles array content", () => {
				const raw = JSON.stringify({
					type: "message",
					message: {
						role: "user",
						content: [{ type: "text", text: "array content message" }],
					},
				});

				expect(ext.extractFirstMessage(raw)).toBe("array content message");
			});

			test("extractFirstMessage returns null for empty session", () => {
				expect(ext.extractFirstMessage("")).toBeNull();
			});

			test("extractFirstMessage truncates long messages to 200 chars", () => {
				const longMsg = "b".repeat(300);
				const raw = JSON.stringify({
					type: "message",
					message: { role: "user", content: longMsg },
				});

				const result = ext.extractFirstMessage(raw);
				expect(result).not.toBeNull();
				expect(result!.length).toBe(200);
			});

			test("extractSessionName returns name from custom session-name entry", () => {
				const raw = [
					JSON.stringify({
						type: "session",
						id: "abc",
						timestamp: "2026-01-01T00:00:00Z",
					}),
					JSON.stringify({
						type: "custom",
						customType: "session-name",
						data: { name: "refactor auth module" },
					}),
				].join("\n");

				expect(ext.extractSessionName(raw)).toBe("refactor auth module");
			});

			test("extractSessionName returns null when no name entry", () => {
				const raw = [
					JSON.stringify({
						type: "session",
						id: "abc",
						timestamp: "2026-01-01T00:00:00Z",
					}),
					JSON.stringify({
						type: "message",
						message: { role: "user", content: "hello" },
					}),
				].join("\n");

				expect(ext.extractSessionName(raw)).toBeNull();
			});
		});

		describe("opencode", () => {
			const ext = getMetadataExtractors("opencode")!;

			test("extractFirstMessage returns first user text", () => {
				const raw = JSON.stringify([
					{
						info: {
							role: "user",
							id: "m1",
							sessionID: "s1",
							time: { created: 1700000000000 },
						},
						parts: [
							{
								id: "p1",
								sessionID: "s1",
								messageID: "m1",
								type: "text",
								text: "fix the auth redirect",
							},
						],
					},
					{
						info: {
							role: "user",
							id: "m2",
							sessionID: "s1",
							time: { created: 1700000002000 },
						},
						parts: [
							{
								id: "p2",
								sessionID: "s1",
								messageID: "m2",
								type: "text",
								text: "second message",
							},
						],
					},
				]);

				expect(ext.extractFirstMessage(raw)).toBe("fix the auth redirect");
			});

			test("extractFirstMessage returns null for empty session", () => {
				expect(ext.extractFirstMessage("")).toBeNull();
				expect(ext.extractFirstMessage("[]")).toBeNull();
			});

			test("extractFirstMessage truncates long messages to 200 chars", () => {
				const longMsg = "x".repeat(300);
				const raw = JSON.stringify([
					{
						info: {
							role: "user",
							id: "m1",
							sessionID: "s1",
							time: { created: 1700000000000 },
						},
						parts: [
							{
								id: "p1",
								sessionID: "s1",
								messageID: "m1",
								type: "text",
								text: longMsg,
							},
						],
					},
				]);

				const result = ext.extractFirstMessage(raw);
				expect(result).not.toBeNull();
				expect(result!.length).toBe(200);
			});

			test("extractSessionName always returns null", () => {
				const raw = JSON.stringify([
					{
						info: {
							role: "user",
							id: "m1",
							sessionID: "s1",
							time: { created: 1700000000000 },
						},
						parts: [
							{
								id: "p1",
								sessionID: "s1",
								messageID: "m1",
								type: "text",
								text: "hello",
							},
						],
					},
				]);

				expect(ext.extractSessionName(raw)).toBeNull();
			});
		});
	});
});
