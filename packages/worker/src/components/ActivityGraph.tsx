import type { FC } from "hono/jsx";
import type { DailyActivityCount } from "@/lib/db";
import { Rect, Text, Tooltip, useHeatmapLayout, zinc } from "@/lib/svg";

type ActivityGraphProps = {
	dailyCounts: DailyActivityCount[];
	org?: string;
	repo?: string;
};

const ActivityGraph: FC<ActivityGraphProps> = ({ dailyCounts }) => {
	const layout = useHeatmapLayout({ dailyCounts });

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">{layout.summary}</span>
			</div>
			<div class="overflow-x-auto activity-graph-container">
				<svg
					width="100%"
					viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
					preserveAspectRatio="xMidYMid meet"
					class="block"
				>
					{layout.monthLabels.map((ml) => (
						<Text x={ml.x} y={10} fill={zinc[500]}>
							{ml.text}
						</Text>
					))}

					{layout.dayLabels.map((dl) => (
						<Text x={0} y={dl.y} fill={zinc[600]}>
							{dl.text}
						</Text>
					))}

					{layout.cells.map((cell) => (
						<Rect
							x={cell.x}
							y={cell.y}
							width={layout.cellSize}
							height={layout.cellSize}
							rx={2}
							fill={cell.fill}
							tooltipId={cell.tooltipId}
							isInteractive
						/>
					))}
				</svg>

				{layout.cells.map((cell) => (
					<Tooltip
						id={cell.tooltipId}
						title={cell.tooltipTitle}
						body={cell.tooltipBody}
					/>
				))}
			</div>
		</div>
	);
};

export { ActivityGraph };
export type { ActivityGraphProps };
