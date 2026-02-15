import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { verifySessionToken } from "../lib/auth";

export const SESSION_COOKIE_NAME = "residue_session";

export const sessionMiddleware = createMiddleware<{
	Bindings: Env;
	Variables: { username: string };
}>(async (c, next) => {
	// Skip auth for the login page
	const path = new URL(c.req.url).pathname;
	if (path === "/app/login") {
		return next();
	}

	const token = getCookie(c, SESSION_COOKIE_NAME);
	if (!token) {
		return c.redirect("/app/login");
	}

	const username = await verifySessionToken({
		token,
		secret: c.env.AUTH_TOKEN,
	});

	if (!username) {
		return c.redirect("/app/login");
	}

	c.set("username", username);
	await next();
});
