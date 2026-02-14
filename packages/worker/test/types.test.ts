import { describe, it, expect } from "vitest";
import { getMapper, mapperRegistry } from "../src/mappers";
import type { Mapper, Message, ToolCall } from "../src/types";

describe("common message types", () => {
  it("ToolCall shape is valid", () => {
    const tc: ToolCall = { name: "read", input: "foo.ts", output: "contents" };
    expect(tc.name).toBe("read");
    expect(tc.input).toBe("foo.ts");
    expect(tc.output).toBe("contents");
  });

  it("Message with tool_calls and model is valid", () => {
    const msg: Message = {
      role: "assistant",
      content: "hello",
      timestamp: "2025-01-01T00:00:00Z",
      model: "claude-sonnet-4-5",
      tool_calls: [{ name: "bash", input: "ls", output: "file.txt" }],
    };
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("hello");
    expect(msg.timestamp).toBe("2025-01-01T00:00:00Z");
    expect(msg.model).toBe("claude-sonnet-4-5");
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls![0].name).toBe("bash");
  });

  it("Message without optional fields is valid", () => {
    const msg: Message = { role: "human", content: "hi" };
    expect(msg.timestamp).toBeUndefined();
    expect(msg.tool_calls).toBeUndefined();
  });
});

describe("mapper registry", () => {
  it("registry contains claude-code", () => {
    expect(mapperRegistry["claude-code"]).toBeDefined();
    expect(typeof mapperRegistry["claude-code"]).toBe("function");
  });

  it("getMapper returns mapper for known agent", () => {
    const mapper = getMapper("claude-code");
    expect(mapper).not.toBeNull();
    expect(typeof mapper).toBe("function");
  });

  it("getMapper returns null for unknown agent", () => {
    expect(getMapper("unknown-agent")).toBeNull();
    expect(getMapper("")).toBeNull();
  });

  it("claude-code placeholder mapper returns empty array", () => {
    const mapper = getMapper("claude-code")!;
    const result = mapper("any raw data");
    expect(result).toEqual([]);
  });

  it("mapper satisfies Mapper type signature", () => {
    const mapper: Mapper = getMapper("claude-code")!;
    const messages: Message[] = mapper("test");
    expect(Array.isArray(messages)).toBe(true);
  });
});
