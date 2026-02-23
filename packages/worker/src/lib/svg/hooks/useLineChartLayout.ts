/**
 * Computes a fully positioned daily activity line chart.
 *
 * Plots raw daily sessions and commits as two lines with daily granularity.
 * Fills gap days with zero so the lines are continuous.
 *
 * Returns everything the component needs to render -- no math in JSX.
 */
import type { DailyActivityCount } from "@/lib/db";
import { zinc } from "@/lib/svg/colors";
import { formatLong, formatShort, toDateStr } from "@/lib/svg/dates";
import { gridTicks, labelStep, yFromValue } from "@/lib/svg/math";
import { pluralize } from "@/lib/svg/text";

type LinePoint = {
	x: number;
	y: number;
	value: number;
};

type HoverZone = {
	x: number;
	width: number;
	tooltipId: string;
	tooltipTitle: string;
	tooltipBody: string;
};

type LineChartGridLine = {
	value: number;
	y: number;
};

type LineSeries = {
	points: LinePoint[];
	pathD: string;
	color: string;
	label: string;
	total: number;
};

type LineChartLayout = {
	series: LineSeries[];
	gridLines: LineChartGridLine[];
	xLabels: { text: string; x: number }[];
	hoverZones: HoverZone[];
	svgWidth: number;
	svgHeight: number;
	topPadding: number;
	drawableHeight: number;
	leftGutter: number;
	gridLineColor: string;
	gridLabelColor: string;
	xLabelColor: string;
	xLabelY: number;
};

const CHART_HEIGHT = 120;
const LEFT_GUTTER = 28;
const TOP_PADDING = 8;
const BOTTOM_GUTTER = 20;
const CONTAINER_WIDTH = 700;
const MAX_DAYS = 180;

const useLineChartLayout = ({
	dailyCounts,
	commitColor,
	sessionColor,
}: {
	dailyCounts: DailyActivityCount[];
	commitColor: string;
	sessionColor: string;
}): LineChartLayout | null => {
	if (dailyCounts.length === 0) return null;

	// Index raw data by date string
	const countMap = new Map<
		string,
		{ sessionCount: number; commitCount: number }
	>();
	for (const dc of dailyCounts) {
		countMap.set(dc.date, {
			sessionCount: dc.sessionCount,
			commitCount: dc.commitCount,
		});
	}

	const sorted = [...countMap.keys()].sort();
	const firstDate = sorted[0];
	const lastDate = sorted[sorted.length - 1];

	const [fy, fm, fd] = firstDate.split("-").map(Number);
	const [ly, lm, ld] = lastDate.split("-").map(Number);
	const start = new Date(Date.UTC(fy, fm - 1, fd));
	const end = new Date(Date.UTC(ly, lm - 1, ld));

	// Fill every day from start to end
	type DayEntry = {
		date: string;
		label: string;
		longLabel: string;
		sessionCount: number;
		commitCount: number;
	};

	const allDays: DayEntry[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		const key = toDateStr({ date: cursor });
		const data = countMap.get(key);
		allDays.push({
			date: key,
			label: formatShort({ dateStr: key }),
			longLabel: formatLong({ dateStr: key }),
			sessionCount: data?.sessionCount ?? 0,
			commitCount: data?.commitCount ?? 0,
		});
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	// Trim to most recent MAX_DAYS
	const days =
		allDays.length > MAX_DAYS
			? allDays.slice(allDays.length - MAX_DAYS)
			: allDays;

	if (days.length === 0) return null;

	const maxVal = Math.max(
		...days.map((d) => Math.max(d.sessionCount, d.commitCount)),
		1,
	);
	const ticks = gridTicks({ max: maxVal });
	const effectiveMax = ticks[ticks.length - 1];

	const drawArea = CONTAINER_WIDTH - LEFT_GUTTER - 4;
	const pointCount = days.length;
	const slotWidth = pointCount > 1 ? drawArea / (pointCount - 1) : drawArea;

	const svgWidth = CONTAINER_WIDTH;
	const svgHeight = CHART_HEIGHT + BOTTOM_GUTTER + TOP_PADDING;
	const drawableHeight = CHART_HEIGHT;

	// Grid lines
	const gridLines: LineChartGridLine[] = ticks.map((v) => ({
		value: v,
		y: yFromValue({
			value: v,
			max: effectiveMax,
			top: TOP_PADDING,
			height: drawableHeight,
		}),
	}));

	// Position points for each series
	const positionPoints = ({ values }: { values: number[] }): LinePoint[] =>
		values.map((value, i) => ({
			x: LEFT_GUTTER + i * slotWidth,
			y: yFromValue({
				value,
				max: effectiveMax,
				top: TOP_PADDING,
				height: drawableHeight,
			}),
			value,
		}));

	const commitPoints = positionPoints({
		values: days.map((d) => d.commitCount),
	});
	const sessionPoints = positionPoints({
		values: days.map((d) => d.sessionCount),
	});

	// Build SVG path d attribute from points
	const buildPathD = ({ points }: { points: LinePoint[] }): string => {
		if (points.length === 0) return "";
		const segments = points.map((p, i) =>
			i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`,
		);
		return segments.join(" ");
	};

	const totalCommits = days.reduce((s, d) => s + d.commitCount, 0);
	const totalSessions = days.reduce((s, d) => s + d.sessionCount, 0);

	const series: LineSeries[] = [
		{
			points: commitPoints,
			pathD: buildPathD({ points: commitPoints }),
			color: commitColor,
			label: "commits",
			total: totalCommits,
		},
		{
			points: sessionPoints,
			pathD: buildPathD({ points: sessionPoints }),
			color: sessionColor,
			label: "conversations",
			total: totalSessions,
		},
	];

	// X-axis labels
	const labelCharWidth = 6;
	const interval = labelStep({
		slotWidth,
		labelWidth: 7 * labelCharWidth,
	});
	const xLabels = days
		.map((d, i) =>
			i % interval === 0
				? {
						text: d.label,
						x: LEFT_GUTTER + i * slotWidth,
					}
				: null,
		)
		.filter((l): l is { text: string; x: number } => l !== null);

	// Hover zones for tooltips (one per day)
	const halfSlot = slotWidth / 2;
	const hoverZones: HoverZone[] = days.map((d, i) => {
		const centerX = LEFT_GUTTER + i * slotWidth;
		const isFirst = i === 0;
		const isLast = i === days.length - 1;
		return {
			x: isFirst ? centerX : centerX - halfSlot,
			width: isFirst || isLast ? halfSlot : slotWidth,
			tooltipId: `lc-${d.date}`,
			tooltipTitle: d.longLabel,
			tooltipBody: `${pluralize({ count: d.commitCount, singular: "commit" })} / ${pluralize({ count: d.sessionCount, singular: "conversation" })}`,
		};
	});

	return {
		series,
		gridLines,
		xLabels,
		hoverZones,
		svgWidth,
		svgHeight,
		topPadding: TOP_PADDING,
		drawableHeight,
		leftGutter: LEFT_GUTTER,
		gridLineColor: zinc[800],
		gridLabelColor: zinc[600],
		xLabelColor: zinc[600],
		xLabelY: TOP_PADDING + drawableHeight + 14,
	};
};

export { useLineChartLayout };
export type {
	LineChartLayout,
	LineSeries,
	LinePoint,
	HoverZone,
	LineChartGridLine,
};
