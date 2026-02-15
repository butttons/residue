import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, basicAuthHeader } from "./utils";

beforeAll(async () => {
	await applyMigrations(env.DB);
});

describe("auth middleware", () => {
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
		// Should not be 401 - will be 404 since no route handler yet, but auth passed
		expect(res.status).not.toBe(401);
	});

	it("does not require bearer auth for non-api routes", async () => {
		const res = await SELF.fetch("https://test.local/app", {
			headers: basicAuthHeader(),
		});
		expect(res.status).toBe(200);
	});

	it("returns 401 for app routes without basic auth", async () => {
		const res = await SELF.fetch("https://test.local/app");
		expect(res.status).toBe(401);
	});
});
