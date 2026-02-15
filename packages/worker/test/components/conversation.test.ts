import { describe, expect, it } from "vitest";
import { parseContent } from "../../src/components/Conversation";

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
