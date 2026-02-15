import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sessionCookieHeader } from "./utils";

describe("API auth middleware", () => {
	it("returns 401 when no Authorization header is provided", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions", {
			method: "POST",
		});
		expect(res.status).toBe(401);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Unauthorized");
	});

	it("returns 401 when Authorization header has wrong format", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions", {
			method: "POST",
			headers: { Authorization: "Basic abc123" },
		});
		expect(res.status).toBe(401);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Unauthorized");
	});

	it("returns 401 when token is invalid", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions", {
			method: "POST",
			headers: { Authorization: "Bearer wrong-token" },
		});
		expect(res.status).toBe(401);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Unauthorized");
	});

	it("allows request with valid token", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions", {
			method: "POST",
			headers: { Authorization: `Bearer ${env.AUTH_TOKEN}` },
		});
		expect(res.status).not.toBe(401);
	});
});

describe("session auth middleware", () => {
	it("redirects to login for app routes without session cookie", async () => {
		const res = await SELF.fetch("https://test.local/app", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("allows login page without session cookie", async () => {
		const res = await SELF.fetch("https://test.local/app/login");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Sign in");
	});

	it("allows app routes with valid session cookie", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app", {
			headers,
		});
		expect(res.status).toBe(200);
	});

	it("redirects to login with invalid session cookie", async () => {
		const res = await SELF.fetch("https://test.local/app", {
			headers: { Cookie: "residue_session=invalid-token" },
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});
});
