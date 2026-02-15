import { env, SELF } from "cloudflare:test";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { DB } from "../src/lib/db";

const migrations = import.meta.glob("../migrations/*.sql", {
	query: "?raw",
	import: "default",
	eager: true,
});

export async function applyMigrations(db: D1Database): Promise<void> {
	const files = Object.keys(migrations).sort();
	for (const file of files) {
		const sql = migrations[file] as string;
		for (const stmt of sql.split(";").filter((s) => s.trim())) {
			await db.prepare(stmt).run();
		}
	}
}

/**
 * Keep for backward compat in API auth tests.
 */
export function basicAuthHeader(): Record<string, string> {
	const encoded = btoa(`${env.ADMIN_USERNAME}:${env.ADMIN_PASSWORD}`);
	return { Authorization: `Basic ${encoded}` };
}

/**
 * Ensure the test admin user exists in D1 and return a session cookie header.
 */
export async function sessionCookieHeader(): Promise<Record<string, string>> {
	const db = new DB(env.DB);
	const existing = await db.getUserByUsername(env.ADMIN_USERNAME);
	if (!existing) {
		const passwordHash = await hashPassword({ password: env.ADMIN_PASSWORD });
		await db.createUser({
			id: crypto.randomUUID(),
			username: env.ADMIN_USERNAME,
			passwordHash,
		});
	}

	const token = await createSessionToken({
		username: env.ADMIN_USERNAME,
		secret: env.AUTH_TOKEN,
	});

	return { Cookie: `residue_session=${token}` };
}
