import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", authMiddleware);

app.get("/", (c) => {
  return c.text("residue worker");
});

export default app;
