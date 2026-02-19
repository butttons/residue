import { createMiddleware } from "hono/factory";
import packageJson from "../../package.json";

export const VERSION = packageJson.version;

export const versionMiddleware = createMiddleware(async (c, next) => {
	await next();
	c.header("X-Version", VERSION);
});
