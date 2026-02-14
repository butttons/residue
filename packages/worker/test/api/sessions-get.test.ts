import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { applyMigrations } from "../utils";

const AUTH_HEADER = { Authorization: `Bearer ${env.AUTH_TOKEN}` };

async function seedSession(opts: {
  id: string;
  agent: string;
  agentVersion: string;
  status: "open" | "ended";
  data: string;
}) {
  // Write raw data to R2 directly (simulates presigned URL upload)
  await env.BUCKET.put(`sessions/${opts.id}.json`, opts.data);

  // POST metadata to D1
  await SELF.fetch("https://test.local/api/sessions", {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        id: opts.id,
        agent: opts.agent,
        agent_version: opts.agentVersion,
        status: opts.status,
      },
      commits: [],
    }),
  });
}

beforeAll(async () => {
  await applyMigrations(env.DB);
});

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM commits").run();
  await env.DB.prepare("DELETE FROM sessions").run();
});

describe("GET /api/sessions/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/some-id");
    expect(res.status).toBe(401);
  });

  it("returns 404 for nonexistent session", async () => {
    const res = await SELF.fetch("https://test.local/api/sessions/nonexistent", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("Session not found");
  });

  it("returns session metadata and raw data", async () => {
    const rawData = '{"messages": [{"role": "human", "content": "hello"}]}';
    await seedSession({
      id: "sess-1",
      agent: "claude-code",
      agentVersion: "1.2.3",
      status: "ended",
      data: rawData,
    });

    const res = await SELF.fetch("https://test.local/api/sessions/sess-1", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);

    const body = await res.json<{
      session: {
        id: string;
        agent: string;
        agent_version: string;
        created_at: number;
        ended_at: number | null;
      };
      data: string;
    }>();

    expect(body.session.id).toBe("sess-1");
    expect(body.session.agent).toBe("claude-code");
    expect(body.session.agent_version).toBe("1.2.3");
    expect(body.session.created_at).toBeTypeOf("number");
    expect(body.session.ended_at).toBeTypeOf("number");
    expect(body.data).toBe(rawData);
  });

  it("returns null ended_at for open sessions", async () => {
    await seedSession({
      id: "sess-open",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "open",
      data: "{}",
    });

    const res = await SELF.fetch("https://test.local/api/sessions/sess-open", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);

    const body = await res.json<{
      session: { ended_at: number | null };
      data: string;
    }>();
    expect(body.session.ended_at).toBeNull();
  });

  it("does not include r2_key in the response", async () => {
    await seedSession({
      id: "sess-no-key",
      agent: "claude-code",
      agentVersion: "1.0.0",
      status: "ended",
      data: "test",
    });

    const res = await SELF.fetch("https://test.local/api/sessions/sess-no-key", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);

    const body = await res.json<Record<string, unknown>>();
    const session = body.session as Record<string, unknown>;
    expect(session).not.toHaveProperty("r2_key");
  });
});
