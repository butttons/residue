/**
 * Computes a fully positioned weekly bar chart from daily activity data.
 *
 * Buckets daily counts into weeks, sizes paired bars (commit + session),
 * computes grid lines, and resolves X-axis label intervals.
 * Returns everything the component needs to render -- no math in JSX.
 */
import type { DailyActivityCount } from "@/lib/db";
import { zinc } from "@/lib/svg/colors";
import { formatShort, toDateStr, weekStart } from "@/lib/svg/dates";
import {
	gridTicks,
	heightFromValue,
	labelStep,
	yFromValue,
} from "@/lib/svg/math";
import { pluralize } from "@/lib/svg/text";

type BarGroup = {
	tooltipId: string;
	tooltipTitle: string;
	tooltipBody: string;
	hoverX: number;
	hoverWidth: number;
	bars: {
		x: number;
		y: number;
		width: number;
		height: number;
		fill: string;
	}[];
};

type GridLine = {
	value: number;
	y: number;
};

type BarChartLayout = {
	groups: BarGroup[];
	gridLines: GridLine[];
	xLabels: { text: string; x: number }[];
	svgWidth: number;
	svgHeight: number;
	topPadding: number;
	drawableHeight: number;
	leftGutter: number;
	gridLineColor: string;
	gridLabelColor: string;
	xLabelColor: string;
	xLabelY: number;
	totalCommits: number;
	totalSessions: number;
	commitColor: string;
	sessionColor: string;
};

const CHART_HEIGHT = 120;
const LEFT_GUTTER = 28;
const TOP_PADDING = 8;
const BOTTOM_GUTTER = 20;
const CONTAINER_WIDTH = 700;
const MAX_WEEKS = 26;

const useBarChartLayout = ({
	dailyCounts,
	commitColor,
	sessionColor,
}: {
	dailyCounts: DailyActivityCount[];
	commitColor: string;
	sessionColor: string;
}): BarChartLayout | null => {
	const weekMap = new Map<
		string,
		{ sessionCount: number; commitCount: number }
	>();
	for (const dc of dailyCounts) {
		const ws = weekStart({ dateStr: dc.date });
		const existing = weekMap.get(ws);
		if (existing) {
			existing.sessionCount += dc.sessionCount;
			existing.commitCount += dc.commitCount;
		} else {
			weekMap.set(ws, {
				sessionCount: dc.sessionCount,
				commitCount: dc.commitCount,
			});
		}
	}

	const allWeeks = [...weekMap.keys()].sort();
	if (allWeeks.length === 0) return null;

	const [fy, fm, fd] = allWeeks[0].split("-").map(Number);
	const [ly, lm, ld] = allWeeks[allWeeks.length - 1].split("-").map(Number);
	const start = new Date(Date.UTC(fy, fm - 1, fd));
	const end = new Date(Date.UTC(ly, lm - 1, ld));

	type Bucket = {
		weekStart: string;
		label: string;
		sessionCount: number;
		commitCount: number;
	};
	const allBuckets: Bucket[] = [];
	const cursor = new Date(start);
	while (cursor <= end) {
		const key = toDateStr({ date: cursor });
		const data = weekMap.get(key);
		allBuckets.push({
			weekStart: key,
			label: formatShort({ dateStr: key }),
			sessionCount: data?.sessionCount ?? 0,
			commitCount: data?.commitCount ?? 0,
		});
		cursor.setUTCDate(cursor.getUTCDate() + 7);
	}

	const buckets =
		allBuckets.length > MAX_WEEKS
			? allBuckets.slice(allBuckets.length - MAX_WEEKS)
			: allBuckets;

	if (buckets.length === 0) return null;

	const maxVal = Math.max(
		...buckets.map((b) => Math.max(b.sessionCount, b.commitCount)),
		1,
	);
	const ticks = gridTicks({ max: maxVal });
	const effectiveMax = ticks[ticks.length - 1];

	const drawArea = CONTAINER_WIDTH - LEFT_GUTTER - 4;
	const groupWidth = Math.floor(drawArea / Math.max(buckets.length, 1));
	const barWidth = Math.min(Math.max(Math.floor(groupWidth * 0.35), 4), 24);
	const innerGap = Math.max(Math.floor(barWidth * 0.3), 2);
	const pairWidth = barWidth * 2 + innerGap;

	const svgWidth = CONTAINER_WIDTH;
	const svgHeight = CHART_HEIGHT + BOTTOM_GUTTER + TOP_PADDING;
	const drawableHeight = CHART_HEIGHT;

	const gridLines: GridLine[] = ticks.map((v) => ({
		value: v,
		y: yFromValue({
			value: v,
			max: effectiveMax,
			top: TOP_PADDING,
			height: drawableHeight,
		}),
	}));

	const groups: BarGroup[] = buckets.map((bucket, i) => {
		const groupCenter = LEFT_GUTTER + i * groupWidth + groupWidth / 2;
		const pairStart = groupCenter - pairWidth / 2;

		const bars: BarGroup["bars"] = [];

		if (bucket.commitCount > 0) {
			bars.push({
				x: pairStart,
				y: yFromValue({
					value: bucket.commitCount,
					max: effectiveMax,
					top: TOP_PADDING,
					height: drawableHeight,
				}),
				width: barWidth,
				height: heightFromValue({
					value: bucket.commitCount,
					max: effectiveMax,
					height: drawableHeight,
				}),
				fill: commitColor,
			});
		}

		if (bucket.sessionCount > 0) {
			bars.push({
				x: pairStart + barWidth + innerGap,
				y: yFromValue({
					value: bucket.sessionCount,
					max: effectiveMax,
					top: TOP_PADDING,
					height: drawableHeight,
				}),
				width: barWidth,
				height: heightFromValue({
					value: bucket.sessionCount,
					max: effectiveMax,
					height: drawableHeight,
				}),
				fill: sessionColor,
			});
		}

		return {
			tooltipId: `sc-${bucket.weekStart}`,
			tooltipTitle: `Week of ${bucket.label}`,
			tooltipBody: `${pluralize({ count: bucket.commitCount, singular: "commit" })} / ${pluralize({ count: bucket.sessionCount, singular: "conversation" })}`,
			hoverX: LEFT_GUTTER + i * groupWidth,
			hoverWidth: groupWidth,
			bars,
		};
	});

	const labelCharWidth = 6;
	const interval = labelStep({
		slotWidth: groupWidth,
		labelWidth: 7 * labelCharWidth,
	});
	const xLabels = buckets
		.map((bucket, i) =>
			i % interval === 0
				? {
						text: bucket.label,
						x: LEFT_GUTTER + i * groupWidth + groupWidth / 2,
					}
				: null,
		)
		.filter((l): l is { text: string; x: number } => l !== null);

	const totalCommits = buckets.reduce((s, b) => s + b.commitCount, 0);
	const totalSessions = buckets.reduce((s, b) => s + b.sessionCount, 0);

	return {
		groups,
		gridLines,
		xLabels,
		svgWidth,
		svgHeight,
		topPadding: TOP_PADDING,
		drawableHeight,
		leftGutter: LEFT_GUTTER,
		gridLineColor: zinc[800],
		gridLabelColor: zinc[600],
		xLabelColor: zinc[600],
		xLabelY: TOP_PADDING + drawableHeight + 14,
		totalCommits,
		totalSessions,
		commitColor,
		sessionColor,
	};
};

export { useBarChartLayout };
export type { BarChartLayout, BarGroup, GridLine };
