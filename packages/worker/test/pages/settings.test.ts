import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDL } from "../../src/lib/db";
import { sessionCookieHeader } from "../utils";

const DL = createDL({ db: env.DB });

describe("POST /app/settings/visibility", () => {
	it("enables public visibility", async () => {
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/visibility", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "is_public=true",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("/app/settings");
		expect(location).toContain("success");
		expect(location).toContain("publicly");

		const isPublic = (await DL.settings.getIsPublic()).value;
		expect(isPublic).toBe(true);
	});

	it("disables public visibility", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const headers = await sessionCookieHeader();
		const res = await SELF.fetch("https://test.local/app/settings/visibility", {
			method: "POST",
			headers: {
				...headers,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "is_public=false",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("private");

		const isPublic = (await DL.settings.getIsPublic()).value;
		expect(isPublic).toBe(false);
	});

	it("requires auth even when public", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/settings/visibility", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "is_public=false",
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});
});

describe("public visibility behavior", () => {
	it("allows unauthenticated access to app when public", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app");
		expect(res.status).toBe(200);
	});

	it("still blocks unauthenticated access when private", async () => {
		const res = await SELF.fetch("https://test.local/app", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("blocks unauthenticated access to settings/users when public", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/settings/users", {
			redirect: "manual",
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/app/login");
	});

	it("allows unauthenticated access to org pages when public", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/test-org");
		expect(res.status).not.toBe(302);
	});

	it("allows unauthenticated access to repo pages when public", async () => {
		await DL.settings.set({ key: "is_public", value: "true" });
		const res = await SELF.fetch("https://test.local/app/test-org/test-repo");
		expect(res.status).not.toBe(302);
	});
});
