import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { sessions } from "./routes/sessions";
import { repos } from "./routes/repos";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.route("/api/sessions", sessions);
app.route("/api/repos", repos);

app.get("/", (c) => {
  return c.text("residue worker");
});

export default app;
