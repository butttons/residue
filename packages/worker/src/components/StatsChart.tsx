import type { FC } from "hono/jsx";
import type { DailyActivityCount } from "@/lib/db";
import {
	palette,
	pluralize,
	Rect,
	Line as SvgLine,
	Text,
	Tooltip,
	useBarChartLayout,
} from "@/lib/svg";

type StatsChartProps = {
	dailyCounts: DailyActivityCount[];
};

const StatsChart: FC<StatsChartProps> = ({ dailyCounts }) => {
	const layout = useBarChartLayout({
		dailyCounts,
		commitColor: palette.blue,
		sessionColor: palette.amber,
	});

	if (!layout) return <span />;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Weekly activity</span>
				<div class="flex items-center gap-4 text-xs text-zinc-500">
					<span class="flex items-center gap-1.5">
						<span
							class="w-2.5 h-2.5 rounded-sm inline-block"
							style={`background: ${layout.commitColor}`}
						/>
						{pluralize({ count: layout.totalCommits, singular: "commit" })}
					</span>
					<span class="flex items-center gap-1.5">
						<span
							class="w-2.5 h-2.5 rounded-sm inline-block"
							style={`background: ${layout.sessionColor}`}
						/>
						{pluralize({
							count: layout.totalSessions,
							singular: "conversation",
						})}
					</span>
				</div>
			</div>
			<div class="overflow-x-auto">
				<svg
					width="100%"
					viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
					preserveAspectRatio="xMinYMid meet"
					class="block"
				>
					{layout.gridLines.map((gl) => (
						<>
							<SvgLine
								x1={layout.leftGutter}
								y1={gl.y}
								x2={layout.svgWidth}
								y2={gl.y}
								stroke={layout.gridLineColor}
							/>
							<Text
								x={layout.leftGutter - 4}
								y={gl.y + 3}
								fill={layout.gridLabelColor}
								fontSize={9}
								anchor="end"
							>
								{gl.value}
							</Text>
						</>
					))}

					{layout.groups.map((group) => (
						<>
							<Rect
								x={group.hoverX}
								y={layout.topPadding}
								width={group.hoverWidth}
								height={layout.drawableHeight}
								fill="transparent"
								tooltipId={group.tooltipId}
								isInteractive
							/>
							{group.bars.map((bar) => (
								<Rect
									x={bar.x}
									y={bar.y}
									width={bar.width}
									height={bar.height}
									rx={2}
									fill={bar.fill}
									opacity={0.85}
								/>
							))}
						</>
					))}

					{layout.xLabels.map((label) => (
						<Text
							x={label.x}
							y={layout.xLabelY}
							fill={layout.xLabelColor}
							fontSize={9}
							anchor="middle"
						>
							{label.text}
						</Text>
					))}
				</svg>

				{layout.groups.map((group) => (
					<Tooltip
						id={group.tooltipId}
						title={group.tooltipTitle}
						body={group.tooltipBody}
					/>
				))}
			</div>
		</div>
	);
};

export { StatsChart };
export type { StatsChartProps };
