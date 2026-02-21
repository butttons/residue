import { Hono } from "hono";
import { provision } from "@/lib/provision";
import { update } from "@/lib/update";

type Env = { Bindings: { BUILD_SHA: string } };

const api = new Hono<Env>();

api.get("/status", (c) => {
	return c.json({ isOk: true, buildSha: c.env.BUILD_SHA });
});

api.post("/provision", async (c) => {
	const body = await c.req.json<{
		token: string;
		accountId: string;
		workerName: string;
		adminUsername: string;
		adminPassword: string;
	}>();

	if (!body.token || !body.accountId || !body.workerName) {
		return c.json({ isSuccess: false, error: "Missing required fields" }, 400);
	}

	const result = await provision({
		token: body.token,
		accountId: body.accountId,
		workerName: body.workerName || "residue",
		adminUsername: body.adminUsername || "admin",
		adminPassword: body.adminPassword || crypto.randomUUID().slice(0, 16),
	});

	return c.json(result, result.isSuccess ? 200 : 500);
});

api.post("/update", async (c) => {
	const body = await c.req.json<{
		token: string;
		accountId: string;
		workerName: string;
	}>();

	if (!body.token || !body.accountId || !body.workerName) {
		return c.json({ isSuccess: false, error: "Missing required fields" }, 400);
	}

	const result = await update({
		token: body.token,
		accountId: body.accountId,
		workerName: body.workerName,
	});

	return c.json(result, result.isSuccess ? 200 : 500);
});

export { api };
