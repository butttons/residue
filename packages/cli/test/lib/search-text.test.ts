import { describe, expect, test } from "bun:test";
import {
	buildSearchText,
	extractClaudeCode,
	extractPi,
	getExtractor,
	summarizeToolInput,
} from "@/lib/search-text";

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
	});
});
