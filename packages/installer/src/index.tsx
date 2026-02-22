import { Hono } from "hono";
import { api } from "@/routes/api";
import { InstallPage } from "@/ui/install";
import { UpdatePage } from "@/ui/update";

type Env = { Bindings: { BUILD_SHA: string; ASSETS: Fetcher } };

const app = new Hono<Env>();

app.route("/api", api);

app.get("/", (c) => {
	return c.html(<InstallPage buildSha={c.env.BUILD_SHA || "dev"} />);
});

app.get("/update", (c) => {
	return c.html(<UpdatePage buildSha={c.env.BUILD_SHA || "dev"} />);
});

export default app;
