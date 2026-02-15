import { describe, expect, it } from "vitest";
import {
	Conversation,
	parseContent,
	roleColor,
} from "../../src/components/Conversation";
import type { Message } from "../../src/types";

describe("roleColor", () => {
	it("returns emerald for human", () => {
		expect(roleColor("human")).toContain("emerald");
	});

	it("returns violet for assistant", () => {
		expect(roleColor("assistant")).toContain("violet");
	});

	it("returns amber for tool", () => {
		expect(roleColor("tool")).toContain("amber");
	});

	it("returns zinc for unknown roles", () => {
		expect(roleColor("unknown")).toContain("zinc");
	});
});

describe("parseContent", () => {
	it("parses plain text", () => {
		const parts = parseContent("hello world");
		expect(parts).toHaveLength(1);
		expect(parts[0].type).toBe("text");
		expect(parts[0].text).toBe("hello world");
	});

	it("parses code blocks", () => {
		const content = "before\n```js\nconst x = 1;\n```\nafter";
		const parts = parseContent(content);
		expect(parts).toHaveLength(3);
		expect(parts[0].type).toBe("text");
		expect(parts[0].text).toBe("before\n");
		expect(parts[1].type).toBe("code");
		expect(parts[1].text).toBe("const x = 1;\n");
		expect(parts[1].lang).toBe("js");
		expect(parts[2].type).toBe("text");
		expect(parts[2].text).toBe("\nafter");
	});

	it("handles empty content", () => {
		const parts = parseContent("");
		expect(parts).toHaveLength(0);
	});

	it("handles multiple code blocks", () => {
		const content = "```ts\na\n```\ntext\n```py\nb\n```";
		const parts = parseContent(content);
		expect(parts).toHaveLength(3);
		expect(parts[0].type).toBe("code");
		expect(parts[1].type).toBe("text");
		expect(parts[2].type).toBe("code");
	});
});

describe("Conversation", () => {
	it("renders messages with role labels", async () => {
		const messages: Message[] = [
			{ role: "human", content: "Hello there" },
			{ role: "assistant", content: "Hi back" },
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).toContain("human");
		expect(html).toContain("assistant");
		expect(html).toContain("Hello there");
		expect(html).toContain("Hi back");
		expect(html).toContain("emerald");
		expect(html).toContain("violet");
	});

	it("renders tool calls as details elements", async () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: "Let me check",
				tool_calls: [
					{ name: "Read", input: '{"path": "foo.ts"}', output: "file content" },
				],
			},
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).toContain("<details");
		expect(html).toContain("Read");
		expect(html).toContain("Input");
		expect(html).toContain("Output");
		expect(html).toContain("file content");
		expect(html).toContain("ph-caret-right");
	});

	it("renders continuation links", async () => {
		const messages: Message[] = [{ role: "human", content: "test" }];
		const result = Conversation({
			messages,
			continuesFrom: { sha: "abc1234567", url: "/app/o/r/abc1234567" },
			continuesIn: { sha: "def7654321", url: "/app/o/r/def7654321" },
		});
		const html = (await result).toString();
		expect(html).toContain("Continues from");
		expect(html).toContain("abc1234");
		expect(html).toContain("ph-arrow-up");
		expect(html).toContain("Continues in");
		expect(html).toContain("def7654");
		expect(html).toContain("ph-arrow-down");
	});

	it("renders empty messages without crashing", async () => {
		const result = Conversation({ messages: [] });
		const html = (await result).toString();
		expect(html).toContain("div");
	});

	it("renders model name when present", async () => {
		const messages: Message[] = [
			{ role: "assistant", content: "hi", model: "claude-3.5-sonnet" },
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).toContain("claude-3.5-sonnet");
	});

	it("renders thinking blocks as collapsible details", async () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: "Here is my answer.",
				thinking: [{ content: "Let me reason through this carefully..." }],
			},
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).toContain("<details");
		expect(html).toContain("thinking");
		expect(html).toContain("ph-brain");
		expect(html).toContain("Let me reason through this carefully...");
		expect(html).toContain("Here is my answer.");
	});

	it("renders multiple thinking blocks", async () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: "Done.",
				thinking: [
					{ content: "First thought" },
					{ content: "Second thought" },
				],
			},
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).toContain("First thought");
		expect(html).toContain("Second thought");
	});

	it("does not render thinking section when absent", async () => {
		const messages: Message[] = [
			{ role: "assistant", content: "No thinking here" },
		];
		const result = Conversation({ messages });
		const html = (await result).toString();
		expect(html).not.toContain("ph-brain");
	});
});
