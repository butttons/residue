import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { hashPassword } from "../lib/auth";
import { DB } from "../lib/db";

const users = new Hono<{ Bindings: Env }>();

const createUserSchema = z.object({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256),
});

users.post(
	"/",
	zValidator("json", createUserSchema, (result, c) => {
		if (!result.success) {
			return c.json(
				{ error: "Validation failed", details: result.error.issues },
				400,
			);
		}
	}),
	async (c) => {
		const { username, password } = c.req.valid("json");
		const db = new DB(c.env.DB);

		const existing = await db.getUserByUsername(username);
		if (existing) {
			return c.json({ error: "Username already exists" }, 409);
		}

		const passwordHash = await hashPassword({ password });
		const id = crypto.randomUUID();

		await db.createUser({ id, username, passwordHash });

		return c.json({ id, username }, 201);
	},
);

users.get("/", async (c) => {
	const db = new DB(c.env.DB);
	const userList = await db.listUsers();

	return c.json(
		{
			users: userList.map((u) => ({
				id: u.id,
				username: u.username,
				created_at: u.created_at,
			})),
		},
		200,
	);
});

users.delete("/:id", async (c) => {
	const id = c.req.param("id");
	const db = new DB(c.env.DB);

	const isDeleted = await db.deleteUser(id);
	if (!isDeleted) {
		return c.json({ error: "User not found" }, 404);
	}

	return c.json({ ok: true }, 200);
});

export { users };
