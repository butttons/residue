import { createMiddleware } from "hono/factory";
import { createDL, type DataLayer } from "../lib/db";

export const dlMiddleware = createMiddleware<{
	Bindings: Env;
	Variables: { DL: DataLayer };
}>(async (c, next) => {
	const DL = createDL({ db: c.env.DB });
	c.set("DL", DL);
	await next();
});
