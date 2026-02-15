import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../../src/lib/auth";
import { DB } from "../../src/lib/db";
import { nonAdminSessionCookieHeader, sessionCookieHeader } from "../utils";

const db = new DB(env.DB);

async function createTestUser(opts: {
	username: string;
	password: string;
}): Promise<string> {
	const passwordHash = await hashPassword({ password: opts.password });
	const id = crypto.randomUUID();
	await db.createUser({ id, username: opts.username, passwordHash });
	return id;
}

describe("GET /app/settings/users", () => {
	it("redirects to login without authentication", async () => {
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("returns HTML when authenticated", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	it("shows the create user form", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("Create user");
		expect(html).toContain('name="username"');
		expect(html).toContain('name="password"');
	});

	it("lists existing users", async () => {
		await createTestUser({ username: "alice", password: "pass1" });
		await createTestUser({ username: "bob", password: "pass2" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("alice");
		expect(html).toContain("bob");
	});

	it("shows user count", async () => {
		await createTestUser({ username: "alice", password: "pass1" });
		const headers = await sessionCookieHeader();
		// sessionCookieHeader creates the admin user, so total is 2
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("2 users");
	});

	it("shows singular user count", async () => {
		const headers = await sessionCookieHeader();
		// Only the admin user exists
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("1 user");
		// Make sure it does not say "1 users"
		expect(html).not.toContain("1 users");
	});

	it("marks current user with you badge", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain("you");
	});

	it("does not show delete button for current user", async () => {
		const headers = await sessionCookieHeader();
		const adminUser = await db.getUserByUsername(env.ADMIN_USERNAME);
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		// The admin user's delete form should not be present
		expect(html).not.toContain(`/app/settings/users/${adminUser!.id}/delete`);
	});

	it("shows delete button for other users", async () => {
		const userId = await createTestUser({
			username: "other",
			password: "pass",
		});
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain(`/app/settings/users/${userId}/delete`);
	});

	it("shows success message from query param", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings/users?success=User+created",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("User created");
	});

	it("shows error message from query param", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings/users?error=Something+went+wrong",
			{ headers },
		);
		const html = await res.text();
		expect(html).toContain("Something went wrong");
	});

	it("shows breadcrumb navigation", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).toContain('href="/app"');
		expect(html).toContain("Settings");
		expect(html).toContain("Users");
	});

	it("hides create form for non-admin users", async () => {
		const headers = await nonAdminSessionCookieHeader({
			username: "viewer",
		});
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).not.toContain("Create user");
	});

	it("hides delete buttons for non-admin users", async () => {
		const userId = await createTestUser({
			username: "target",
			password: "pass",
		});
		const headers = await nonAdminSessionCookieHeader({
			username: "viewer2",
		});
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
		expect(html).not.toContain(`/app/settings/users/${userId}/delete`);
	});
});

describe("POST /app/settings/users (create user)", () => {
	it("creates a new user and redirects with success", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=newuser&password=newpass",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("/app/settings/users");
		expect(location).toContain("success");

		// Verify user was actually created in DB
		const user = await db.getUserByUsername("newuser");
		expect(user).not.toBeNull();
	});

	it("rejects duplicate username", async () => {
		await createTestUser({ username: "existing", password: "pass" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=existing&password=pass",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
		expect(location).toContain("already%20exists");
	});

	it("rejects empty username", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=&password=somepass",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
	});

	it("rejects empty password", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=someuser&password=",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
	});

	it("trims whitespace from username", async () => {
		const headers = await sessionCookieHeader();
		await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=+trimmed+&password=pass",
			redirect: "manual",
		});

		const user = await db.getUserByUsername("trimmed");
		expect(user).not.toBeNull();
	});

	it("rejects create from non-admin user", async () => {
		const headers = await nonAdminSessionCookieHeader({
			username: "regular",
		});
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "username=sneaky&password=pass",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
		expect(location).toContain("super%20admin");

		// Verify user was NOT created
		const user = await db.getUserByUsername("sneaky");
		expect(user).toBeNull();
	});
});

describe("POST /app/settings/users/:id/delete", () => {
	it("deletes a user and redirects with success", async () => {
		const userId = await createTestUser({
			username: "deleteme",
			password: "pass",
		});
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			`https://test.local/app/settings/users/${userId}/delete`,
			{
				method: "POST",
				headers,
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("success");

		// Verify user was deleted from DB
		const user = await db.getUserByUsername("deleteme");
		expect(user).toBeNull();
	});

	it("prevents self-deletion", async () => {
		const headers = await sessionCookieHeader();
		const adminUser = await db.getUserByUsername(env.ADMIN_USERNAME);
		expect(adminUser).not.toBeNull();

		const res = await SELF.fetch(
			`https://test.local/app/settings/users/${adminUser!.id}/delete`,
			{
				method: "POST",
				headers,
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
		expect(location).toContain("Cannot%20delete");

		// Verify user was NOT deleted
		const stillExists = await db.getUserByUsername(env.ADMIN_USERNAME);
		expect(stillExists).not.toBeNull();
	});

	it("handles non-existent user ID", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch(
			"https://test.local/app/settings/users/nonexistent-id/delete",
			{
				method: "POST",
				headers,
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
		expect(location).toContain("not%20found");
	});

	it("rejects delete from non-admin user", async () => {
		const userId = await createTestUser({
			username: "victim",
			password: "pass",
		});
		const headers = await nonAdminSessionCookieHeader({
			username: "regular2",
		});
		const res = await SELF.fetch(
			`https://test.local/app/settings/users/${userId}/delete`,
			{
				method: "POST",
				headers,
				redirect: "manual",
			},
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("error");
		expect(location).toContain("super%20admin");

		// Verify user was NOT deleted
		const user = await db.getUserByUsername("victim");
		expect(user).not.toBeNull();
	});
});
