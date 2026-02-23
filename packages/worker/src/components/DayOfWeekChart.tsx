import type { FC } from "hono/jsx";
import type { DayOfWeekDistribution } from "@/lib/db";
import {
	palette,
	Rect,
	Text,
	Tooltip,
	useDayOfWeekChartLayout,
} from "@/lib/svg";

type DayOfWeekChartProps = {
	days: DayOfWeekDistribution[];
};

const DayOfWeekChart: FC<DayOfWeekChartProps> = ({ days }) => {
	const layout = useDayOfWeekChartLayout({
		days,
		barColor: palette.emerald,
	});

	if (!layout) return <span />;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Day of week</span>
				<span class="text-xs text-zinc-500">
					busiest on <span class="text-zinc-300">{layout.busiestDay}</span>
				</span>
			</div>
			<div class="overflow-x-auto">
				<svg
					width="100%"
					viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
					preserveAspectRatio="xMinYMid meet"
					class="block"
				>
					{layout.bars.map((bar) => (
						<>
							{/* Day label */}
							<Text
								x={bar.labelX}
								y={bar.labelY}
								fill={layout.labelColor}
								fontSize={10}
								anchor="end"
							>
								{bar.label}
							</Text>

							{/* Hover zone (full row) */}
							<Rect
								x={layout.barAreaLeft}
								y={bar.hoverY}
								width={layout.maxBarWidth}
								height={bar.hoverHeight}
								fill="transparent"
								tooltipId={bar.tooltipId}
								isInteractive
							/>

							{/* Actual bar */}
							{bar.count > 0 && (
								<Rect
									x={bar.x}
									y={bar.y}
									width={bar.width}
									height={bar.height}
									rx={3}
									fill={bar.fill}
									opacity={0.85}
								/>
							)}

							{/* Count label */}
							{bar.count > 0 && (
								<Text
									x={bar.countLabelX}
									y={bar.countLabelY}
									fill={layout.countColor}
									fontSize={9}
									anchor="start"
								>
									{bar.count}
								</Text>
							)}
						</>
					))}
				</svg>

				{layout.bars.map((bar) => (
					<Tooltip
						id={bar.tooltipId}
						title={bar.tooltipTitle}
						body={bar.tooltipBody}
					/>
				))}
			</div>
		</div>
	);
};

export { DayOfWeekChart };
export type { DayOfWeekChartProps };
