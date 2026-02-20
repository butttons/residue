import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { verifySessionToken } from "../lib/auth";
import type { AppEnv } from "../types";

export const SESSION_COOKIE_NAME = "residue_session";

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const path = new URL(c.req.url).pathname;

	// Always allow login page
	if (path === "/app/login") {
		return next();
	}

	// Try to authenticate from cookie regardless of public mode
	let authenticatedUsername: string | null = null;
	const token = getCookie(c, SESSION_COOKIE_NAME);
	if (token) {
		const username = await verifySessionToken({
			token,
			secret: c.env.AUTH_TOKEN,
		});
		if (username) {
			authenticatedUsername = username;
			c.set("username", username);
		}
	}

	// Check if the instance is public
	const result = await c.var.DL.settings.getIsPublic();
	const isPublic = result.isOk ? result.value : false;

	// Settings pages always require authentication
	const isSettingsPage = path.startsWith("/app/settings");
	if (isSettingsPage && !authenticatedUsername) {
		return c.redirect("/app/login");
	}

	// In private mode, all routes require authentication
	if (!isPublic && !authenticatedUsername) {
		return c.redirect("/app/login");
	}

	await next();
});
