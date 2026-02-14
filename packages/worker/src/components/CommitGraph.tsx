import type { FC } from "hono/jsx";
import type { GraphData, SessionLane } from "../lib/graph";
import { relativeTime } from "../lib/time";

type CommitGraphProps = {
  data: GraphData;
  org: string;
  repo: string;
};

const ROW_HEIGHT = 60;
const LANE_SPACING = 20;
const DOT_RADIUS = 4;
const LANE_DOT_RADIUS = 3.5;
const LINE_WIDTH = 2;
const TRUNK_GAP = 14;

const laneX = (lane: number): number => lane * LANE_SPACING + LANE_SPACING / 2;

const rowY = (row: number): number => row * ROW_HEIGHT + ROW_HEIGHT / 2;

const trunkX = (laneCount: number): number =>
  laneCount > 0 ? laneCount * LANE_SPACING + TRUNK_GAP : DOT_RADIUS + 2;

const graphWidth = (laneCount: number): number =>
  trunkX(laneCount) + DOT_RADIUS + 4;

const getAgentCounts = (
  sessions: { sessionId: string; agent: string }[]
): { agent: string; count: number }[] => {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.agent, (map.get(s.agent) ?? 0) + 1);
  }
  return [...map.entries()].map(([agent, count]) => ({ agent, count }));
};

const LaneLegend: FC<{ lanes: SessionLane[] }> = ({ lanes }) => {
  if (lanes.length === 0) return <span />;

  return (
    <div class="flex gap-x-4 gap-y-1 mb-4 text-xs text-zinc-500 flex-wrap">
      {lanes.map((lane) => (
        <span class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            style={`background: ${lane.color}`}
          />
          <span class="text-zinc-400">{lane.agent}</span>
          <span class="font-mono text-zinc-600">{lane.sessionId.slice(0, 8)}</span>
        </span>
      ))}
    </div>
  );
};

const GraphSvg: FC<{
  data: GraphData;
  totalHeight: number;
  width: number;
  trunk: number;
}> = ({ data, totalHeight, width, trunk }) => {
  const { commits, lanes, laneCount } = data;

  if (commits.length === 0) return <span />;

  return (
    <svg
      class="absolute left-0 top-0"
      width={width}
      height={totalHeight}
      style="pointer-events: none"
    >
      {/* Trunk line */}
      {commits.length > 1 && (
        <line
          x1={trunk}
          y1={rowY(0)}
          x2={trunk}
          y2={rowY(commits.length - 1)}
          stroke="#3f3f46"
          stroke-width={LINE_WIDTH}
        />
      )}

      {/* Lane vertical lines */}
      {lanes.map((lane) => (
        <line
          x1={laneX(lane.lane)}
          y1={rowY(lane.startRow)}
          x2={laneX(lane.lane)}
          y2={rowY(lane.endRow)}
          stroke={lane.color}
          stroke-width={LINE_WIDTH}
          stroke-opacity="0.5"
        />
      ))}

      {/* Horizontal connectors: lane dots to trunk */}
      {laneCount > 0 &&
        lanes.flatMap((lane) =>
          lane.commitRows.map((row) => (
            <line
              x1={laneX(lane.lane) + LANE_DOT_RADIUS + 1}
              y1={rowY(row)}
              x2={trunk - DOT_RADIUS - 1}
              y2={rowY(row)}
              stroke={lane.color}
              stroke-width={1}
              stroke-opacity="0.25"
              stroke-dasharray="2,2"
            />
          ))
        )}

      {/* Lane dots */}
      {lanes.flatMap((lane) =>
        lane.commitRows.map((row) => (
          <circle
            cx={laneX(lane.lane)}
            cy={rowY(row)}
            r={LANE_DOT_RADIUS}
            fill={lane.color}
          />
        ))
      )}

      {/* Trunk dots */}
      {commits.map((_, i) => (
        <circle cx={trunk} cy={rowY(i)} r={DOT_RADIUS} fill="#3b82f6" />
      ))}
    </svg>
  );
};

const CommitGraph: FC<CommitGraphProps> = ({ data, org, repo }) => {
  const { commits, lanes, laneCount } = data;
  const trunk = trunkX(laneCount);
  const width = graphWidth(laneCount);
  const totalHeight = commits.length * ROW_HEIGHT;

  return (
    <div>
      <LaneLegend lanes={lanes} />

      <div class="relative" style={`min-height: ${totalHeight}px`}>
        <GraphSvg
          data={data}
          totalHeight={totalHeight}
          width={width}
          trunk={trunk}
        />

        <div style={`padding-left: ${width + 8}px`}>
          {commits.map((commit) => {
            const agentCounts = getAgentCounts(
              commit.sessions.map((s) => ({
                sessionId: s.sessionId,
                agent: s.agent,
              }))
            );

            return (
              <div
                style={`height: ${ROW_HEIGHT}px`}
                class="flex flex-col justify-center"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <a
                    href={`/app/${org}/${repo}/${commit.sha}`}
                    class="text-blue-500 font-mono text-sm hover:underline flex-shrink-0"
                  >
                    {commit.sha.slice(0, 7)}
                  </a>
                  {commit.branch && (
                    <span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400 font-mono">
                      <i class="ph ph-git-branch text-[10px] mr-0.5" />
                      {commit.branch}
                    </span>
                  )}
                  {agentCounts.map((ac) => (
                    <span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {ac.agent}
                      {ac.count > 1 ? ` x${ac.count}` : ""}
                    </span>
                  ))}
                  <a
                    href={`https://github.com/${org}/${repo}/commit/${commit.sha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ml-auto text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
                    title="View on GitHub"
                  >
                    <i class="ph ph-github-logo text-sm" />
                  </a>
                </div>
                <p class="text-zinc-100 text-sm truncate">{commit.message}</p>
                <p class="text-zinc-500 text-xs mt-0.5">
                  {commit.author}
                  {commit.committedAt
                    ? ` · ${relativeTime(commit.committedAt)}`
                    : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export { CommitGraph, ROW_HEIGHT };
export type { CommitGraphProps };
