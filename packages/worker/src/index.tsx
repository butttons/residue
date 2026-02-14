import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { sessions } from "./routes/sessions";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.route("/api/sessions", sessions);

app.get("/", (c) => {
  return c.text("residue worker");
});

export default app;
