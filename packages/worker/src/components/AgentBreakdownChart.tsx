import type { FC } from "hono/jsx";
import type { AgentBreakdown } from "@/lib/db";
import { palette, Rect, Text, Tooltip, zinc } from "@/lib/svg";

type AgentBreakdownChartProps = {
	agents: AgentBreakdown[];
};

const agentColors: Record<string, string> = {
	"claude-code": palette.blue,
	pi: palette.amber,
	cursor: palette.emerald,
	copilot: palette.purple,
};

const getAgentColor = ({
	agent,
	index,
}: {
	agent: string;
	index: number;
}): string => {
	if (agentColors[agent]) return agentColors[agent];
	const fallback = [palette.rose, palette.cyan, palette.pink, palette.orange];
	return fallback[index % fallback.length];
};

const BAR_HEIGHT = 24;
const BAR_WIDTH = 500;
const LABEL_Y_OFFSET = 16;

const AgentBreakdownChart: FC<AgentBreakdownChartProps> = ({ agents }) => {
	const total = agents.reduce((sum, a) => sum + a.sessionCount, 0);
	if (total === 0) return <span />;

	// Build stacked segments
	type Segment = {
		x: number;
		width: number;
		fill: string;
		agent: string;
		count: number;
		tooltipId: string;
	};

	let offset = 0;
	const segments: Segment[] = agents.map((a, i) => {
		const w = Math.max((a.sessionCount / total) * BAR_WIDTH, 2);
		const seg: Segment = {
			x: offset,
			width: w,
			fill: getAgentColor({ agent: a.agent, index: i }),
			agent: a.agent,
			count: a.sessionCount,
			tooltipId: `ab-${a.agent}`,
		};
		offset += w;
		return seg;
	});

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Conversations by agent</span>
			</div>
			<div class="overflow-x-auto">
				<svg
					width="100%"
					viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
					preserveAspectRatio="xMinYMid meet"
					class="block rounded"
				>
					{segments.map((seg) => (
						<Rect
							x={seg.x}
							y={0}
							width={seg.width}
							height={BAR_HEIGHT}
							fill={seg.fill}
							rx={0}
							opacity={0.85}
							tooltipId={seg.tooltipId}
							isInteractive
						/>
					))}
				</svg>
				{segments.map((seg) => (
					<Tooltip
						id={seg.tooltipId}
						title={seg.agent}
						body={`${seg.count} conversations (${Math.round((seg.count / total) * 100)}%)`}
					/>
				))}
			</div>
			<div class="flex items-center gap-4 mt-3 text-xs text-zinc-500 flex-wrap">
				{segments.map((seg) => (
					<span class="flex items-center gap-1.5">
						<span
							class="w-2.5 h-2.5 rounded-sm inline-block"
							style={`background: ${seg.fill}`}
						/>
						<span class="text-zinc-300">{seg.agent}</span>
						<span>{seg.count}</span>
					</span>
				))}
			</div>
		</div>
	);
};

export { AgentBreakdownChart };
export type { AgentBreakdownChartProps };
