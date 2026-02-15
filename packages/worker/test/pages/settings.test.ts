import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";
import { sessionCookieHeader } from "../utils";

const db = new DB(env.DB);

describe("GET /app/settings", () => {
	it("redirects to login without authentication", async () => {
		const res = await SELF.fetch("https://test.local/app/settings", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("returns HTML when authenticated", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	it("shows public visibility section", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("Public visibility");
	});

	it("shows make public button when private", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("Make public");
		expect(html).not.toContain("Make private");
	});

	it("shows make private button when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("Make private");
		expect(html).not.toContain("Make public");
	});

	it("shows link to users page", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("/app/settings/users");
		expect(html).toContain("Users");
	});

	it("shows success flash message", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings?success=Done",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("Done");
	});

	it("shows error flash message", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings?error=Something+broke",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("Something broke");
	});

	it("shows breadcrumb navigation", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app"');
		expect(html).toContain("Settings");
	});

	it("still requires auth for settings even when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/settings", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});
});

describe("POST /app/settings/visibility", () => {
	it("enables public visibility", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings/visibility",
			{
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "is_public=true",
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("/app/settings");
		expect(location).toContain("success");
		expect(location).toContain("publicly");

		const isPublic = await db.getIsPublic();
		expect(isPublic).toBe(true);
	});

	it("disables public visibility", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings/visibility",
			{
				method: "POST",
				headers: {
					...headers,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "is_public=false",
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("private");

		const isPublic = await db.getIsPublic();
		expect(isPublic).toBe(false);
	});

	it("requires auth even when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch(
			"https://test.local/app/settings/visibility",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: "is_public=false",
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});
});

describe("public visibility behavior", () => {
	it("allows unauthenticated access to app when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app");
		expect(res.status).toBe(200);
	});

	it("shows sign in link when unauthenticated in public mode", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app");
		const html = await res.text();
		expect(html).toContain('href="/app/login"');
		expect(html).toContain("sign in");
	});

	it("shows username and settings when authenticated in public mode", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", { headers });
		const html = await res.text();
		expect(html).toContain(env.ADMIN_USERNAME);
		expect(html).toContain("settings");
		expect(html).toContain("sign out");
	});

	it("still blocks unauthenticated access when private", async () => {
		const res = await SELF.fetch("https://test.local/app", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("blocks unauthenticated access to settings/users when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("allows unauthenticated access to org pages when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/test-org");
		// 404 is fine, the point is it does not redirect to login
		expect(res.status).not.toBe(302);
	});

	it("allows unauthenticated access to repo pages when public", async () => {
		await db.setSetting({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/test-org/test-repo");
		expect(res.status).not.toBe(302);
	});
});
