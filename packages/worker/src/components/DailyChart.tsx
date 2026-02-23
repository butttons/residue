import type { FC } from "hono/jsx";
import type { DailyActivityCount } from "@/lib/db";
import {
	Path,
	palette,
	pluralize,
	Rect,
	Line as SvgLine,
	Text,
	Tooltip,
	useLineChartLayout,
} from "@/lib/svg";

type DailyChartProps = {
	dailyCounts: DailyActivityCount[];
};

const DailyChart: FC<DailyChartProps> = ({ dailyCounts }) => {
	const layout = useLineChartLayout({
		dailyCounts,
		commitColor: palette.blue,
		sessionColor: palette.amber,
	});

	if (!layout) return <span />;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Daily activity</span>
				<div class="flex items-center gap-4 text-xs text-zinc-500">
					{layout.series.map((s) => (
						<span class="flex items-center gap-1.5">
							<span
								class="w-2.5 h-0.5 rounded-sm inline-block"
								style={`background: ${s.color}`}
							/>
							{pluralize({
								count: s.total,
								singular: s.label === "commits" ? "commit" : "conversation",
							})}
						</span>
					))}
				</div>
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

					{/* Area fills */}
					{layout.series.map((s) => {
						if (s.points.length < 2) return null;
						const first = s.points[0];
						const last = s.points[s.points.length - 1];
						const baseline = layout.topPadding + layout.drawableHeight;
						const areaD = `${s.pathD} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
						return (
							<Path
								d={areaD}
								stroke="none"
								strokeWidth={0}
								strokeOpacity={0}
								fill={s.color}
								fillOpacity={0.08}
							/>
						);
					})}

					{/* Lines */}
					{layout.series.map((s) => (
						<Path d={s.pathD} stroke={s.color} strokeWidth={2} />
					))}

					{/* Hover zones */}
					{layout.hoverZones.map((hz) => (
						<Rect
							x={hz.x}
							y={layout.topPadding}
							width={hz.width}
							height={layout.drawableHeight}
							fill="transparent"
							tooltipId={hz.tooltipId}
							isInteractive
						/>
					))}

					{/* X-axis labels */}
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

				{layout.hoverZones.map((hz) => (
					<Tooltip
						id={hz.tooltipId}
						title={hz.tooltipTitle}
						body={hz.tooltipBody}
					/>
				))}
			</div>
		</div>
	);
};

export { DailyChart };
export type { DailyChartProps };
