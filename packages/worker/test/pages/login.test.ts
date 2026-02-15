import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../../src/lib/auth";
import { DB } from "../../src/lib/db";

const db = new DB(env.DB);

async function createTestUser(username: string, password: string) {
	const passwordHash = await hashPassword({ password });
	await db.createUser({
		id: crypto.randomUUID(),
		username,
		passwordHash,
	});
}

describe("GET /app/login", () => {
	it("renders login form", async () => {
		const res = await SELF.fetch("https://test.local/app/login");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Sign in");
		expect(html).toContain("username");
		expect(html).toContain("password");
	});

	it("is accessible without authentication", async () => {
		const res = await SELF.fetch("https://test.local/app/login");
		expect(res.status).toBe(200);
	});
});

describe("POST /app/login", () => {
	it("sets session cookie on valid login", async () => {
		await createTestUser("alice", "secret123");

		const res = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=alice&password=secret123",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app");

		const setCookie = res.headers.get("set-cookie");
		expect(setCookie).toContain("residue_session=");
		expect(setCookie).toContain("HttpOnly");
	});

	it("returns 401 for wrong password", async () => {
		await createTestUser("alice", "secret123");

		const res = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=alice&password=wrong",
		});
		expect(res.status).toBe(401);
		const html = await res.text();
		expect(html).toContain("Invalid username or password");
	});

	it("returns 401 for unknown user", async () => {
		const res = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=nobody&password=anything",
		});
		expect(res.status).toBe(401);
	});

	it("returns 400 for empty fields", async () => {
		const res = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=&password=",
		});
		expect(res.status).toBe(400);
	});
});

describe("POST /app/logout", () => {
	it("clears session cookie and redirects to login", async () => {
		await createTestUser("alice", "secret123");

		// Login first to get a cookie
		const loginRes = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=alice&password=secret123",
			redirect: "manual",
		});
		const loginCookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";

		// Logout with the cookie
		const res = await SELF.fetch("https://test.local/app/logout", {
			method: "POST",
			headers: { Cookie: loginCookie },
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});
});

describe("login flow end-to-end", () => {
	it("login cookie grants access to app pages", async () => {
		await createTestUser("alice", "secret123");

		// Login
		const loginRes = await SELF.fetch("https://test.local/app/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: "username=alice&password=secret123",
			redirect: "manual",
		});
		const setCookie = loginRes.headers.get("set-cookie") ?? "";
		const cookieValue = setCookie.split(";")[0]; // "residue_session=..."

		// Use the cookie to access an app page
		const appRes = await SELF.fetch("https://test.local/app", {
			headers: { Cookie: cookieValue },
		});
		expect(appRes.status).toBe(200);
		const html = await appRes.text();
		expect(html).toContain("residue");
		// Should show username and sign out link
		expect(html).toContain("alice");
		expect(html).toContain("sign out");
	});
});
