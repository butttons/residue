import { Hono } from "hono";
import { api } from "@/routes/api";
import { Page } from "@/ui/page";

type Env = { Bindings: { BUILD_SHA: string } };

const app = new Hono<Env>();

app.route("/api", api);

app.get("/", (c) => {
	const buildSha = c.env.BUILD_SHA || "dev";
	return c.html(<Page buildSha={buildSha} />);
});

export default app;
