import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { sessions } from "./routes/sessions";
import { repos } from "./routes/repos";
import { pages } from "./routes/pages";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.route("/api/sessions", sessions);
app.route("/api/repos", repos);

app.route("/app", pages);

app.get("/", (c) => c.redirect("/app"));

export default app;
