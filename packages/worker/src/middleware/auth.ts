import { createMiddleware } from "hono/factory";

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
	async (c, next) => {
		const header = c.req.header("Authorization");

		if (!header || !header.startsWith("Bearer ")) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		const token = header.slice("Bearer ".length);

		if (token !== c.env.AUTH_TOKEN) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		await next();
	},
);
