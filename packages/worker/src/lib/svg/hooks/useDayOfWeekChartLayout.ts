/**
 * Computes a fully positioned day-of-week distribution chart.
 *
 * Renders 7 horizontal bars (Sun-Sat) showing session count per day.
 * SQLite strftime('%w') gives 0=Sunday through 6=Saturday.
 *
 * Returns everything the component needs to render -- no math in JSX.
 */
import type { DayOfWeekDistribution } from "@/lib/db";
import { zinc } from "@/lib/svg/colors";
import { pluralize } from "@/lib/svg/text";

type DayBar = {
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
	dayOfWeek: number;
	label: string;
	count: number;
	tooltipId: string;
	tooltipTitle: string;
	tooltipBody: string;
	hoverY: number;
	hoverHeight: number;
	labelX: number;
	labelY: number;
	countLabelX: number;
	countLabelY: number;
};

type DayOfWeekChartLayout = {
	bars: DayBar[];
	svgWidth: number;
	svgHeight: number;
	barAreaLeft: number;
	maxBarWidth: number;
	totalSessions: number;
	busiestDay: string;
	busiestCount: number;
	labelColor: string;
	countColor: string;
};

const DEFAULT_WIDTH = 340;
const LABEL_GUTTER = 36;
const RIGHT_PADDING = 40;
const BAR_HEIGHT = 18;
const BAR_GAP = 6;
const TOP_PADDING = 4;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const useDayOfWeekChartLayout = ({
	days,
	barColor,
	width,
}: {
	days: DayOfWeekDistribution[];
	barColor: string;
	width?: number;
}): DayOfWeekChartLayout | null => {
	if (days.length === 0) return null;

	// Build full 7-day array
	const dayMap = new Map<number, number>();
	for (const d of days) {
		dayMap.set(d.dayOfWeek, d.sessionCount);
	}

	const allDays = Array.from({ length: 7 }, (_, i) => ({
		dayOfWeek: i,
		label: DAY_LABELS[i],
		count: dayMap.get(i) ?? 0,
	}));

	const containerWidth = width ?? DEFAULT_WIDTH;

	const maxVal = Math.max(...allDays.map((d) => d.count), 1);
	const maxBarWidth = containerWidth - LABEL_GUTTER - RIGHT_PADDING;

	const totalSessions = allDays.reduce((sum, d) => sum + d.count, 0);
	let busiestIdx = 0;
	for (let i = 1; i < allDays.length; i++) {
		if (allDays[i].count > allDays[busiestIdx].count) {
			busiestIdx = i;
		}
	}

	const svgHeight = TOP_PADDING + 7 * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + 4;

	const bars: DayBar[] = allDays.map((d, i) => {
		const y = TOP_PADDING + i * (BAR_HEIGHT + BAR_GAP);
		const barWidth =
			d.count > 0 ? Math.max((d.count / maxVal) * maxBarWidth, 2) : 0;

		return {
			x: LABEL_GUTTER,
			y,
			width: barWidth,
			height: BAR_HEIGHT,
			fill: barColor,
			dayOfWeek: d.dayOfWeek,
			label: d.label,
			count: d.count,
			tooltipId: `dow-${d.dayOfWeek}`,
			tooltipTitle: DAY_LABELS[d.dayOfWeek],
			tooltipBody: pluralize({ count: d.count, singular: "conversation" }),
			hoverY: y,
			hoverHeight: BAR_HEIGHT,
			labelX: LABEL_GUTTER - 6,
			labelY: y + BAR_HEIGHT / 2 + 4,
			countLabelX: LABEL_GUTTER + barWidth + 6,
			countLabelY: y + BAR_HEIGHT / 2 + 4,
		};
	});

	return {
		bars,
		svgWidth: containerWidth,
		svgHeight,
		barAreaLeft: LABEL_GUTTER,
		maxBarWidth,
		totalSessions,
		busiestDay: DAY_LABELS[busiestIdx],
		busiestCount: allDays[busiestIdx].count,
		labelColor: zinc[500],
		countColor: zinc[400],
	};
};

export { useDayOfWeekChartLayout };
export type { DayOfWeekChartLayout, DayBar };
