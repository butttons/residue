import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };

describe("POST /api/sessions/upload-url", () => {
	it("returns 401 without auth", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "test-session-1" }),
		});
		expect(res.status).toBe(401);
	});

	it("returns 400 when session_id is missing", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		const body = await res.json<{ error: string }>();
		expect(body.error).toBe("Validation failed");
	});

	it("returns 400 when session_id is empty", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "" }),
		});
		expect(res.status).toBe(400);
	});

	it("returns presigned URL and r2_key on success", async () => {
		const res = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "test-session-1" }),
		});
		expect(res.status).toBe(200);

		const body = await res.json<{ url: string; r2_key: string }>();
		expect(body.url).toContain("test-account-id.r2.cloudflarestorage.com");
		expect(body.url).toContain("residue-sessions");
		expect(body.url).toContain("sessions/test-session-1.json");
		expect(body.url).toContain("X-Amz-Signature=");
		expect(body.r2_key).toBe("sessions/test-session-1.json");
	});

	it("generates unique URLs for different session IDs", async () => {
		const res1 = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "session-a" }),
		});
		const body1 = await res1.json<{ url: string; r2_key: string }>();

		const res2 = await SELF.fetch("https://test.local/api/sessions/upload-url", {
			method: "POST",
			headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: "session-b" }),
		});
		const body2 = await res2.json<{ url: string; r2_key: string }>();

		expect(body1.r2_key).toBe("sessions/session-a.json");
		expect(body2.r2_key).toBe("sessions/session-b.json");
		expect(body1.url).not.toBe(body2.url);
	});
});
