import { describe, expect, it } from "vitest";
import {
	createSessionToken,
	hashPassword,
	verifyPassword,
	verifySessionToken,
} from "../../src/lib/auth";

describe("password hashing", () => {
	it("hashPassword returns salt:hash format", async () => {
		const result = await hashPassword({ password: "test123" });
		const parts = result.split(":");
		expect(parts).toHaveLength(2);
		// Salt is 16 bytes = 32 hex chars
		expect(parts[0]).toHaveLength(32);
		// SHA-256 derived key is 32 bytes = 64 hex chars
		expect(parts[1]).toHaveLength(64);
	});

	it("produces different hashes for same password (random salt)", async () => {
		const hash1 = await hashPassword({ password: "same-password" });
		const hash2 = await hashPassword({ password: "same-password" });
		expect(hash1).not.toBe(hash2);
	});

	it("verifyPassword returns true for correct password", async () => {
		const hash = await hashPassword({ password: "correct-password" });
		const isValid = await verifyPassword({
			password: "correct-password",
			storedHash: hash,
		});
		expect(isValid).toBe(true);
	});

	it("verifyPassword returns false for wrong password", async () => {
		const hash = await hashPassword({ password: "correct-password" });
		const isValid = await verifyPassword({
			password: "wrong-password",
			storedHash: hash,
		});
		expect(isValid).toBe(false);
	});

	it("verifyPassword returns false for malformed stored hash", async () => {
		const isValid = await verifyPassword({
			password: "anything",
			storedHash: "not-a-valid-hash",
		});
		expect(isValid).toBe(false);
	});
});

describe("session tokens", () => {
	const secret = "test-secret-key";

	it("createSessionToken returns a signed token string", async () => {
		const token = await createSessionToken({ username: "alice", secret });
		expect(typeof token).toBe("string");
		// Format: username:expiry:signature
		const parts = token.split(":");
		expect(parts.length).toBeGreaterThanOrEqual(3);
	});

	it("verifySessionToken returns username for valid token", async () => {
		const token = await createSessionToken({ username: "bob", secret });
		const result = await verifySessionToken({ token, secret });
		expect(result).toBe("bob");
	});

	it("verifySessionToken returns null for wrong secret", async () => {
		const token = await createSessionToken({ username: "bob", secret });
		const result = await verifySessionToken({
			token,
			secret: "wrong-secret",
		});
		expect(result).toBeNull();
	});

	it("verifySessionToken returns null for tampered token", async () => {
		const token = await createSessionToken({ username: "bob", secret });
		const tampered = `alice${token.slice(3)}`;
		const result = await verifySessionToken({ token: tampered, secret });
		expect(result).toBeNull();
	});

	it("verifySessionToken returns null for empty string", async () => {
		const result = await verifySessionToken({ token: "", secret });
		expect(result).toBeNull();
	});

	it("verifySessionToken returns null for garbage input", async () => {
		const result = await verifySessionToken({
			token: "not-a-valid-token",
			secret,
		});
		expect(result).toBeNull();
	});

	it("handles usernames with colons", async () => {
		const token = await createSessionToken({
			username: "user:with:colons",
			secret,
		});
		const result = await verifySessionToken({ token, secret });
		expect(result).toBe("user:with:colons");
	});
});
