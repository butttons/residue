import { env } from "cloudflare:test";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { createDL } from "../src/lib/db";

const DL = createDL({ db: env.DB });

/**
 * Ensure the test admin user exists in D1 and return a session cookie header.
 */
export async function sessionCookieHeader(): Promise<Record<string, string>> {
	const existing = (await DL.users.getByUsername(env.ADMIN_USERNAME)).value;
	if (!existing) {
		const passwordHash = await hashPassword({ password: env.ADMIN_PASSWORD });
		await DL.users.create({
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

/**
 * Create a non-admin user in D1 and return a session cookie header for them.
 */
export async function nonAdminSessionCookieHeader({
	username,
}: {
	username: string;
}): Promise<Record<string, string>> {
	const existing = (await DL.users.getByUsername(username)).value;
	if (!existing) {
		const passwordHash = await hashPassword({ password: "test-password" });
		await DL.users.create({
			id: crypto.randomUUID(),
			username,
			passwordHash,
		});
	}

	const token = await createSessionToken({
		username,
		secret: env.AUTH_TOKEN,
	});

	return { Cookie: `residue_session=${token}` };
}
