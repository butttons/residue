import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { authMiddleware } from "./middleware/auth";
import { pages } from "./routes/pages";
import { repos } from "./routes/repos";
import { sessions } from "./routes/sessions";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.use(
	"/app/*",
	basicAuth({
		verifyUser: (username, password, c) => {
			return (
				username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD
			);
		},
	}),
);

app.route("/api/sessions", sessions);
app.route("/api/repos", repos);

app.route("/app", pages);

app.get("/", (c) => c.redirect("/app"));

export default app;
