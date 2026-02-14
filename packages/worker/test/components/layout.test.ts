import { describe, it, expect } from "vitest";
import { Layout } from "../../src/components/Layout";

describe("Layout", () => {
  it("renders HTML document with title", async () => {
    const result = Layout({ title: "Test Page", children: "Hello World" });
    const html = (await result).toString();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Test Page</title>");
    expect(html).toContain("Hello World");
  });

  it("includes Tailwind CDN script", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain("cdn.tailwindcss.com");
  });

  it("includes JetBrains Mono font", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain("JetBrains+Mono");
    expect(html).toContain("JetBrains Mono");
  });

  it("includes Phosphor Icons CDN", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain("phosphor-icons");
  });

  it("has dark mode class on html element", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain('class="dark"');
  });

  it("has zinc-950 background on body", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain("bg-zinc-950");
  });

  it("has max-w-4xl responsive container", async () => {
    const result = Layout({ title: "T", children: "" });
    const html = (await result).toString();
    expect(html).toContain("max-w-4xl");
    expect(html).toContain("mx-auto");
  });
});
