import { Hono } from "hono";

const search = new Hono<{ Bindings: Env }>();

search.get("/", async (c) => {
	const query = c.req.query("q");
	if (!query) {
		return c.json({ error: "Missing ?q= query parameter" }, 400);
	}

	const results = await c.env.AI.autorag("residue-search").search({
		query,
		max_num_results: 10,
	});

	return c.json(results);
});

search.get("/ai", async (c) => {
	const query = c.req.query("q");
	if (!query) {
		return c.json({ error: "Missing ?q= query parameter" }, 400);
	}

	const results = await c.env.AI.autorag("residue-search").aiSearch({
		query,
		max_num_results: 10,
	});

	return c.json(results);
});

export { search };
