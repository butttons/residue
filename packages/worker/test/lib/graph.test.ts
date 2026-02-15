import { describe, expect, it } from "vitest";
import type { CommitWithSessionRow } from "../../src/lib/db";
import { computeGraph } from "../../src/lib/graph";

const row = (opts: {
	sha: string;
	sessionId: string;
	agent?: string;
	message?: string;
	author?: string;
	committedAt?: number;
	branch?: string;
}): CommitWithSessionRow => ({
	commit_sha: opts.sha,
	session_id: opts.sessionId,
	agent: opts.agent ?? "claude-code",
	message: opts.message ?? `commit ${opts.sha}`,
	author: opts.author ?? "dev",
	committed_at: opts.committedAt ?? null,
	branch: opts.branch ?? null,
});

describe("computeGraph", () => {
	it("handles single commit with single session (no lanes)", () => {
		const rows = [row({ sha: "aaa", sessionId: "s1" })];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(1);
		expect(result.commits[0].sha).toBe("aaa");
		expect(result.commits[0].sessions).toHaveLength(1);
		expect(result.commits[0].sessions[0].sessionId).toBe("s1");
		expect(result.commits[0].sessions[0].lane).toBe(-1);
		expect(result.lanes).toHaveLength(0);
		expect(result.laneCount).toBe(0);
	});

	it("creates a lane for a session spanning two commits", () => {
		const rows = [
			row({ sha: "aaa", sessionId: "s1" }),
			row({ sha: "bbb", sessionId: "s1" }),
		];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(2);
		expect(result.lanes).toHaveLength(1);
		expect(result.laneCount).toBe(1);

		const lane = result.lanes[0];
		expect(lane.sessionId).toBe("s1");
		expect(lane.lane).toBe(0);
		expect(lane.startRow).toBe(0);
		expect(lane.endRow).toBe(1);
		expect(lane.commitRows).toEqual([0, 1]);

		// Both commits should reference the lane
		expect(result.commits[0].sessions[0].lane).toBe(0);
		expect(result.commits[1].sessions[0].lane).toBe(0);
	});

	it("assigns separate lanes to overlapping sessions", () => {
		// Session A spans commits 0-2, Session B spans commits 1-3
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sB" }),
			row({ sha: "c2", sessionId: "sA" }),
			row({ sha: "c2", sessionId: "sB" }),
			row({ sha: "c3", sessionId: "sB" }),
		];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(4);
		expect(result.lanes).toHaveLength(2);
		expect(result.laneCount).toBe(2);

		const laneA = result.lanes.find((l) => l.sessionId === "sA")!;
		const laneB = result.lanes.find((l) => l.sessionId === "sB")!;

		// They should be on different lanes since they overlap
		expect(laneA.lane).not.toBe(laneB.lane);
		expect(laneA.startRow).toBe(0);
		expect(laneA.endRow).toBe(2);
		expect(laneB.startRow).toBe(1);
		expect(laneB.endRow).toBe(3);
	});

	it("reuses lanes for non-overlapping sessions", () => {
		// Session A spans commits 0-1, Session B spans commits 2-3
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sA" }),
			row({ sha: "c2", sessionId: "sB" }),
			row({ sha: "c3", sessionId: "sB" }),
		];
		const result = computeGraph(rows);

		expect(result.lanes).toHaveLength(2);
		// They should reuse the same lane since they dont overlap
		expect(result.laneCount).toBe(1);
		expect(result.lanes[0].lane).toBe(0);
		expect(result.lanes[1].lane).toBe(0);
	});

	it("handles a commit with multiple sessions", () => {
		const rows = [
			row({ sha: "c0", sessionId: "s1" }),
			row({ sha: "c0", sessionId: "s2" }),
		];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(1);
		expect(result.commits[0].sessions).toHaveLength(2);
		// Both are single-commit sessions, no lanes
		expect(result.lanes).toHaveLength(0);
	});

	it("mixes single-commit and multi-commit sessions", () => {
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c0", sessionId: "sSingle" }),
			row({ sha: "c1", sessionId: "sA" }),
		];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(2);
		expect(result.lanes).toHaveLength(1);
		expect(result.lanes[0].sessionId).toBe("sA");

		// c0 should have both sessions
		const c0Sessions = result.commits[0].sessions;
		expect(c0Sessions).toHaveLength(2);

		const laneSession = c0Sessions.find((s) => s.sessionId === "sA")!;
		const singleSession = c0Sessions.find((s) => s.sessionId === "sSingle")!;
		expect(laneSession.lane).toBe(0);
		expect(singleSession.lane).toBe(-1);
	});

	it("handles session spanning non-adjacent commits", () => {
		// Session A on commits 0 and 2, not on commit 1
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sOther" }),
			row({ sha: "c2", sessionId: "sA" }),
		];
		const result = computeGraph(rows);

		expect(result.lanes).toHaveLength(1);
		const lane = result.lanes[0];
		expect(lane.sessionId).toBe("sA");
		expect(lane.startRow).toBe(0);
		expect(lane.endRow).toBe(2);
		expect(lane.commitRows).toEqual([0, 2]);
	});

	it("preserves commit order from input rows", () => {
		const rows = [
			row({ sha: "newest", sessionId: "s1", committedAt: 300 }),
			row({ sha: "middle", sessionId: "s2", committedAt: 200 }),
			row({ sha: "oldest", sessionId: "s3", committedAt: 100 }),
		];
		const result = computeGraph(rows);

		expect(result.commits.map((c) => c.sha)).toEqual([
			"newest",
			"middle",
			"oldest",
		]);
	});

	it("deduplicates repeated commit-session pairs", () => {
		const rows = [
			row({ sha: "c0", sessionId: "s1" }),
			row({ sha: "c0", sessionId: "s1" }), // duplicate
			row({ sha: "c1", sessionId: "s1" }),
		];
		const result = computeGraph(rows);

		expect(result.commits).toHaveLength(2);
		expect(result.commits[0].sessions).toHaveLength(1);
	});

	it("assigns distinct colors to different lanes", () => {
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c0", sessionId: "sB" }),
			row({ sha: "c1", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sB" }),
		];
		const result = computeGraph(rows);

		expect(result.lanes).toHaveLength(2);
		expect(result.lanes[0].color).not.toBe(result.lanes[1].color);
	});

	it("handles three overlapping sessions needing three lanes", () => {
		// All three sessions overlap at c1
		const rows = [
			row({ sha: "c0", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sA" }),
			row({ sha: "c1", sessionId: "sB" }),
			row({ sha: "c1", sessionId: "sC" }),
			row({ sha: "c2", sessionId: "sB" }),
			row({ sha: "c2", sessionId: "sC" }),
		];
		const result = computeGraph(rows);

		expect(result.lanes).toHaveLength(3);
		expect(result.laneCount).toBe(3);

		const usedLanes = new Set(result.lanes.map((l) => l.lane));
		expect(usedLanes.size).toBe(3);
	});
});
