import type { CommitWithSessionRow } from "../lib/db";

const LANE_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#fb7185", // rose-400
  "#c084fc", // purple-400
  "#22d3ee", // cyan-400
  "#f472b6", // pink-400
  "#fb923c", // orange-400
];

type SessionInfo = {
  sessionId: string;
  agent: string;
  lane: number;
  color: string;
};

type GraphCommit = {
  sha: string;
  message: string | null;
  author: string | null;
  committedAt: number | null;
  branch: string | null;
  sessions: SessionInfo[];
};

type SessionLane = {
  sessionId: string;
  agent: string;
  lane: number;
  color: string;
  startRow: number;
  endRow: number;
  commitRows: number[];
};

type GraphData = {
  commits: GraphCommit[];
  lanes: SessionLane[];
  laneCount: number;
};

const computeGraph = (rows: CommitWithSessionRow[]): GraphData => {
  // 1. Group by commit maintaining order, track sessions
  const commitOrder: string[] = [];
  const commitMap = new Map<
    string,
    {
      sha: string;
      message: string | null;
      author: string | null;
      committedAt: number | null;
      branch: string | null;
      sessionIds: Set<string>;
    }
  >();
  const sessionData = new Map<
    string,
    { agent: string; commitIndices: Set<number> }
  >();

  for (const row of rows) {
    let commitIndex: number;

    if (!commitMap.has(row.commit_sha)) {
      commitIndex = commitOrder.length;
      commitOrder.push(row.commit_sha);
      commitMap.set(row.commit_sha, {
        sha: row.commit_sha,
        message: row.message,
        author: row.author,
        committedAt: row.committed_at,
        branch: row.branch,
        sessionIds: new Set(),
      });
    } else {
      commitIndex = commitOrder.indexOf(row.commit_sha);
    }

    const commit = commitMap.get(row.commit_sha)!;

    if (!commit.sessionIds.has(row.session_id)) {
      commit.sessionIds.add(row.session_id);

      const existing = sessionData.get(row.session_id);
      if (existing) {
        existing.commitIndices.add(commitIndex);
      } else {
        sessionData.set(row.session_id, {
          agent: row.agent,
          commitIndices: new Set([commitIndex]),
        });
      }
    }
  }

  // 2. Separate multi-commit sessions for lane assignment
  const multiCommitSessions: {
    sessionId: string;
    agent: string;
    startRow: number;
    endRow: number;
    commitRows: number[];
  }[] = [];

  for (const [sessionId, data] of sessionData.entries()) {
    if (data.commitIndices.size > 1) {
      const sorted = [...data.commitIndices].sort((a, b) => a - b);
      multiCommitSessions.push({
        sessionId,
        agent: data.agent,
        startRow: sorted[0],
        endRow: sorted[sorted.length - 1],
        commitRows: sorted,
      });
    }
  }

  // Sort by startRow, then longer spans first (stable visual ordering)
  multiCommitSessions.sort((a, b) => {
    if (a.startRow !== b.startRow) return a.startRow - b.startRow;
    return b.endRow - b.startRow - (a.endRow - a.startRow);
  });

  // 3. Assign lanes greedily
  const laneEndRows: number[] = [];
  const lanes: SessionLane[] = [];
  let colorIndex = 0;

  for (const session of multiCommitSessions) {
    let assignedLane = -1;

    for (let i = 0; i < laneEndRows.length; i++) {
      if (laneEndRows[i] < session.startRow) {
        assignedLane = i;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = laneEndRows.length;
      laneEndRows.push(-1);
    }

    laneEndRows[assignedLane] = session.endRow;

    lanes.push({
      sessionId: session.sessionId,
      agent: session.agent,
      lane: assignedLane,
      color: LANE_COLORS[colorIndex % LANE_COLORS.length],
      startRow: session.startRow,
      endRow: session.endRow,
      commitRows: session.commitRows,
    });

    colorIndex++;
  }

  // 4. Build final commit objects with session info
  const commits: GraphCommit[] = commitOrder.map((sha, index) => {
    const commitInfo = commitMap.get(sha)!;
    const sessions: SessionInfo[] = [];

    // Multi-commit sessions (have lanes)
    for (const lane of lanes) {
      if (lane.commitRows.includes(index)) {
        sessions.push({
          sessionId: lane.sessionId,
          agent: lane.agent,
          lane: lane.lane,
          color: lane.color,
        });
      }
    }

    // Single-commit sessions (no lane)
    for (const sessionId of commitInfo.sessionIds) {
      const data = sessionData.get(sessionId)!;
      if (data.commitIndices.size === 1) {
        sessions.push({
          sessionId,
          agent: data.agent,
          lane: -1,
          color: "",
        });
      }
    }

    return {
      sha,
      message: commitInfo.message,
      author: commitInfo.author,
      committedAt: commitInfo.committedAt,
      branch: commitInfo.branch,
      sessions,
    };
  });

  return {
    commits,
    lanes,
    laneCount: laneEndRows.length,
  };
};

export { computeGraph, LANE_COLORS };
export type { GraphData, GraphCommit, SessionLane, SessionInfo };
