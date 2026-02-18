import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { sessionMiddleware } from "./middleware/session";
import { auth } from "./routes/auth";
import { pages } from "./routes/pages";
import { repos } from "./routes/repos";
import { search } from "./routes/search";
import { sessions } from "./routes/sessions";
import { settings } from "./routes/settings";
import { users } from "./routes/users";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.use("/app/*", sessionMiddleware);

app.route("/api/sessions", sessions);
app.route("/api/repos", repos);
app.route("/api/users", users);
app.route("/api/search", search);

app.route("/app", auth);
app.route("/app", settings);
app.route("/app", pages);

app.get("/", (c) => c.redirect("/app"));

export default app;
