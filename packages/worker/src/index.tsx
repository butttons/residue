import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { dlMiddleware } from "./middleware/dl";
import { sessionMiddleware } from "./middleware/session";
import { VERSION, versionMiddleware } from "./middleware/version";
import { auth } from "./routes/auth";
import { pages } from "./routes/pages";
import { query } from "./routes/query";
import { repos } from "./routes/repos";
import { sessions } from "./routes/sessions";
import { settings } from "./routes/settings";
import { users } from "./routes/users";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", dlMiddleware);

app.use("/api/*", versionMiddleware);
app.use("/api/*", authMiddleware);

app.use("/app/*", sessionMiddleware);

app.get("/api/ping", (c) => c.json({ version: VERSION }));

app.route("/api/sessions", sessions);
app.route("/api/repos", repos);
app.route("/api/query", query);
app.route("/api/users", users);
app.route("/app", auth);
app.route("/app", settings);
app.route("/app", pages);

app.get("/", (c) => c.redirect("/app"));

export default app;
