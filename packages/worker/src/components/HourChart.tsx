import type { FC } from "hono/jsx";
import type { HourDistribution } from "@/lib/db";
import {
	palette,
	Rect,
	Line as SvgLine,
	Text,
	Tooltip,
	useHourChartLayout,
} from "@/lib/svg";

type HourChartProps = {
	hours: HourDistribution[];
};

const HourChart: FC<HourChartProps> = ({ hours }) => {
	const layout = useHourChartLayout({
		hours,
		barColor: palette.purple,
	});

	if (!layout) return <span />;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Time of day</span>
				<span class="text-xs text-zinc-500">
					peak at{" "}
					<span class="text-zinc-300">
						{layout.peakHour.toString().padStart(2, "0")}:00
					</span>
				</span>
			</div>
			<div class="overflow-x-auto">
				<svg
					width="100%"
					viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
					preserveAspectRatio="xMinYMid meet"
					class="block"
				>
					{/* Grid lines */}
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

					{/* Bars */}
					{layout.bars.map((bar) => (
						<>
							{/* Hover zone (full slot height) */}
							<Rect
								x={bar.hoverX}
								y={layout.topPadding}
								width={bar.hoverWidth}
								height={layout.drawableHeight}
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
									rx={2}
									fill={bar.fill}
									opacity={0.85}
								/>
							)}
						</>
					))}

					{/* Hour labels */}
					{layout.hourLabels.map((label) => (
						<Text
							x={label.x}
							y={layout.xLabelY}
							fill={layout.xLabelColor}
							fontSize={8}
							anchor="middle"
						>
							{label.text}
						</Text>
					))}

					{/* Band labels */}
					{layout.bandLabels.map((band) => (
						<Text
							x={band.x}
							y={layout.bandLabelY}
							fill={layout.xLabelColor}
							fontSize={8}
							anchor="middle"
						>
							{band.text}
						</Text>
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

export { HourChart };
export type { HourChartProps };
