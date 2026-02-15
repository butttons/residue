import { describe, expect, it } from "vitest";
import { Layout } from "../../src/components/Layout";

describe("Layout", () => {
	it("renders HTML document with title", async () => {
		const result = Layout({ title: "Test Page", children: "Hello World" });
		const html = (await result).toString();
		expect(html).toContain("<!doctype html>");
		expect(html).toContain("<title>Test Page</title>");
		expect(html).toContain("Hello World");
	});

	it("includes built stylesheet", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain('/styles.css"');
	});

	it("includes JetBrains Mono font", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain("JetBrains+Mono");
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

	it("renders navbar with bottom border", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain("<nav");
		expect(html).toContain("border-b");
		expect(html).toContain("border-zinc-800");
	});

	it("renders breadcrumbs in navbar when provided", async () => {
		const result = Layout({
			title: "T",
			children: "",
			breadcrumbs: [
				{ label: "residue", href: "/app" },
				{ label: "my-org", href: "/app/my-org" },
				{ label: "my-repo" },
			],
		});
		const html = (await result).toString();
		expect(html).toContain("my-org");
		expect(html).toContain("my-repo");
		expect(html).toContain('href="/app"');
		expect(html).toContain('href="/app/my-org"');
		expect(html).toContain("ph-house");
	});

	it("renders home icon in navbar when no breadcrumbs", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain("ph-house");
		expect(html).toContain('href="/app"');
	});

	it("renders footer with attribution", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain("<footer");
		expect(html).toContain("built by");
		expect(html).toContain("Yash");
		expect(html).toContain("https://butttons.dev");
	});

	it("shows sign in link when no username", async () => {
		const result = Layout({ title: "T", children: "" });
		const html = (await result).toString();
		expect(html).toContain("sign in");
		expect(html).toContain("/app/login");
	});

	it("shows username and sign out when logged in", async () => {
		const result = Layout({ title: "T", children: "", username: "jane" });
		const html = (await result).toString();
		expect(html).toContain("jane");
		expect(html).toContain("sign out");
		expect(html).toContain("settings");
	});
});
