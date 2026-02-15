import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DB } from "../../src/lib/db";

const db = new DB(env.DB);

function authHeaders(body?: Record<string, unknown>): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${env.AUTH_TOKEN}`,
	};
	if (body) {
		headers["Content-Type"] = "application/json";
	}
	return headers;
}

describe("POST /api/users", () => {
	it("creates a user", async () => {
		const res = await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice", password: "secret123" }),
		});
		expect(res.status).toBe(201);
		const body = await res.json<{ id: string; username: string }>();
		expect(body.username).toBe("alice");
		expect(body.id).toBeTruthy();

		// Verify in DB
		const user = await db.getUserByUsername("alice");
		expect(user).not.toBeNull();
		expect(user!.username).toBe("alice");
	});

	it("returns 409 for duplicate username", async () => {
		await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice", password: "secret123" }),
		});

		const res = await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice", password: "different" }),
		});
		expect(res.status).toBe(409);
		const body = await res.json<{ error: string }>();
		expect(body.error).toContain("already exists");
	});

	it("returns 400 for missing fields", async () => {
		const res = await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice" }),
		});
		expect(res.status).toBe(400);
	});

	it("requires bearer auth", async () => {
		const res = await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "alice", password: "secret" }),
		});
		expect(res.status).toBe(401);
	});
});

describe("GET /api/users", () => {
	it("returns empty list when no users", async () => {
		const res = await SELF.fetch("https://test.local/api/users", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = await res.json<{
			users: { id: string; username: string; created_at: number }[];
		}>();
		expect(body.users).toHaveLength(0);
	});

	it("lists created users without password hashes", async () => {
		await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice", password: "s1" }),
		});
		await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "bob", password: "s2" }),
		});

		const res = await SELF.fetch("https://test.local/api/users", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = await res.json<{
			users: { id: string; username: string; created_at: number }[];
		}>();
		expect(body.users).toHaveLength(2);
		const usernames = body.users.map((u) => u.username);
		expect(usernames).toContain("alice");
		expect(usernames).toContain("bob");
		// Should NOT contain password_hash
		const raw = await SELF.fetch("https://test.local/api/users", {
			headers: authHeaders(),
		});
		const rawText = await raw.text();
		expect(rawText).not.toContain("password_hash");
	});
});

describe("DELETE /api/users/:id", () => {
	it("deletes a user", async () => {
		const createRes = await SELF.fetch("https://test.local/api/users", {
			method: "POST",
			headers: authHeaders({}),
			body: JSON.stringify({ username: "alice", password: "s1" }),
		});
		const { id } = await createRes.json<{ id: string }>();

		const res = await SELF.fetch(`https://test.local/api/users/${id}`, {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = await res.json<{ ok: boolean }>();
		expect(body.ok).toBe(true);

		// Verify deleted
		const user = await db.getUserByUsername("alice");
		expect(user).toBeNull();
	});

	it("returns 404 for unknown user", async () => {
		const res = await SELF.fetch(
			"https://test.local/api/users/nonexistent-id",
			{
				method: "DELETE",
				headers: authHeaders(),
			},
		);
		expect(res.status).toBe(404);
	});
});
