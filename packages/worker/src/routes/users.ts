import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { hashPassword } from "../lib/auth";
import type { AppEnv } from "../types";

const users = new Hono<AppEnv>();

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

		const existingResult = await c.var.DL.users.getByUsername(username);
		if (existingResult.isErr) {
			return c.json({ error: "Failed to check existing user" }, 500);
		}
		if (existingResult.value) {
			return c.json({ error: "Username already exists" }, 409);
		}

		const passwordHash = await hashPassword({ password });
		const id = crypto.randomUUID();

		const createResult = await c.var.DL.users.create({
			id,
			username,
			passwordHash,
		});
		if (createResult.isErr) {
			return c.json({ error: "Failed to create user" }, 500);
		}

		return c.json({ id, username }, 201);
	},
);

users.get("/", async (c) => {
	const result = await c.var.DL.users.list();
	if (result.isErr) {
		return c.json({ error: "Failed to list users" }, 500);
	}

	return c.json(
		{
			users: result.value.map((u) => ({
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

	const result = await c.var.DL.users.delete(id);
	if (result.isErr) {
		return c.json({ error: "Failed to delete user" }, 500);
	}
	if (!result.value) {
		return c.json({ error: "User not found" }, 404);
	}

	return c.json({ ok: true }, 200);
});

export { users };
