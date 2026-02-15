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
	it("does not show delete button for current user", async () => {
		const headers = await sessionCookieHeader();
		const adminUser = await db.getUserByUsername(env.ADMIN_USERNAME);
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			headers,
		});
		const html = await res.text();
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

		const stillExists = await db.getUserByUsername(env.ADMIN_USERNAME);
		expect(stillExists).not.toBeNull();
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

		const user = await db.getUserByUsername("victim");
		expect(user).not.toBeNull();
	});
});
