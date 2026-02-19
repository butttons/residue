import type { FC } from "hono/jsx";
import type { GraphData, SessionLane } from "@/lib/graph";
import { Circle, Line, useCommitGraphLayout } from "@/lib/svg";
import { relativeTime } from "@/lib/time";
import { urls } from "@/lib/urls";

type CommitGraphProps = {
	data: GraphData;
	org: string;
	repo: string;
};

const getAgentCounts = (
	sessions: { sessionId: string; agent: string }[],
): { agent: string; count: number }[] => {
	const map = new Map<string, number>();
	for (const s of sessions) {
		map.set(s.agent, (map.get(s.agent) ?? 0) + 1);
	}
	return [...map.entries()].map(([agent, count]) => ({ agent, count }));
};

type LaneLegendProps = {
	lanes: SessionLane[];
	commits: GraphData["commits"];
	org: string;
	repo: string;
};

const LaneLegend: FC<LaneLegendProps> = ({ lanes, commits, org, repo }) => {
	if (lanes.length === 0) return <span />;

	return (
		<div class="flex gap-x-4 gap-y-1 mb-4 text-xs text-zinc-500 flex-wrap">
			{lanes.map((lane) => {
				const firstCommitSha =
					lane.commitRows.length > 0
						? commits[lane.commitRows[0]]?.sha
						: undefined;
				const href = firstCommitSha
					? `/app/${org}/${repo}/${firstCommitSha}#session-${lane.sessionId}`
					: undefined;

				return (
					<a
						href={href}
						class="flex items-center gap-1.5 hover:text-zinc-300 transition-colors"
					>
						<span
							class="w-2 h-2 rounded-full flex-shrink-0"
							style={`background: ${lane.color}`}
						/>
						<span class="text-zinc-400">{lane.agent}</span>
						<span class="font-mono text-zinc-600">
							{lane.sessionId.slice(0, 8)}
						</span>
					</a>
				);
			})}
		</div>
	);
};

const GraphSvg: FC<{
	data: GraphData;
	totalHeight: number;
	width: number;
}> = ({ data, totalHeight, width }) => {
	const layout = useCommitGraphLayout({
		data: {
			commitCount: data.commits.length,
			lanes: data.lanes,
			laneCount: data.laneCount,
		},
	});

	if (data.commits.length === 0) return <span />;

	return (
		<svg
			class="absolute left-0 top-0"
			width={width}
			height={totalHeight}
			style="pointer-events: none"
		>
			{layout.lines.map((l) => (
				<Line
					x1={l.x1}
					y1={l.y1}
					x2={l.x2}
					y2={l.y2}
					stroke={l.stroke}
					strokeWidth={l.strokeWidth}
					strokeOpacity={l.strokeOpacity}
					isDashed={l.isDashed}
					dashArray={l.dashArray}
				/>
			))}

			{layout.dots.map((d) => (
				<Circle cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} />
			))}
		</svg>
	);
};

const CommitGraph: FC<CommitGraphProps> = ({ data, org, repo }) => {
	const layout = useCommitGraphLayout({
		data: {
			commitCount: data.commits.length,
			lanes: data.lanes,
			laneCount: data.laneCount,
		},
	});

	return (
		<div>
			<LaneLegend
				lanes={data.lanes}
				commits={data.commits}
				org={org}
				repo={repo}
			/>

			<div class="relative" style={`min-height: ${layout.totalHeight}px`}>
				<GraphSvg
					data={data}
					totalHeight={layout.totalHeight}
					width={layout.svgWidth}
				/>

				<div style={`padding-left: ${layout.contentLeftPad}px`}>
					{data.commits.map((commit) => {
						const agentCounts = getAgentCounts(
							commit.sessions.map((s) => ({
								sessionId: s.sessionId,
								agent: s.agent,
							})),
						);

						return (
							<div
								style={`height: ${layout.rowHeight}px`}
								class="flex flex-col justify-start"
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
										href={urls.githubCommit({ org, repo, sha: commit.sha })}
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

export { CommitGraph };
export type { CommitGraphProps };
