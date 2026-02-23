/**
 * Computes a fully positioned hour-of-day distribution chart.
 *
 * Renders 24 vertical bars (one per hour, 0-23) showing when sessions
 * are started. Includes time-of-day band labels (night/morning/afternoon/evening).
 *
 * Returns everything the component needs to render -- no math in JSX.
 */
import type { HourDistribution } from "@/lib/db";
import { zinc } from "@/lib/svg/colors";
import { gridTicks, heightFromValue, yFromValue } from "@/lib/svg/math";
import { pluralize } from "@/lib/svg/text";

type HourBar = {
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
	hour: number;
	count: number;
	tooltipId: string;
	tooltipTitle: string;
	tooltipBody: string;
	hoverX: number;
	hoverWidth: number;
};

type HourBandLabel = {
	text: string;
	x: number;
	width: number;
};

type HourChartGridLine = {
	value: number;
	y: number;
};

type HourChartLayout = {
	bars: HourBar[];
	bandLabels: HourBandLabel[];
	hourLabels: { text: string; x: number }[];
	gridLines: HourChartGridLine[];
	svgWidth: number;
	svgHeight: number;
	topPadding: number;
	drawableHeight: number;
	leftGutter: number;
	gridLineColor: string;
	gridLabelColor: string;
	xLabelColor: string;
	xLabelY: number;
	bandLabelY: number;
	totalSessions: number;
	peakHour: number;
	peakCount: number;
};

const DEFAULT_CHART_HEIGHT = 100;
const LEFT_GUTTER = 28;
const TOP_PADDING = 8;
const BOTTOM_GUTTER = 30;
const DEFAULT_WIDTH = 340;

const HOUR_LABELS = [
	"12a",
	"1a",
	"2a",
	"3a",
	"4a",
	"5a",
	"6a",
	"7a",
	"8a",
	"9a",
	"10a",
	"11a",
	"12p",
	"1p",
	"2p",
	"3p",
	"4p",
	"5p",
	"6p",
	"7p",
	"8p",
	"9p",
	"10p",
	"11p",
];

const BANDS = [
	{ label: "night", startHour: 0, endHour: 6 },
	{ label: "morning", startHour: 6, endHour: 12 },
	{ label: "afternoon", startHour: 12, endHour: 18 },
	{ label: "evening", startHour: 18, endHour: 24 },
] as const;

const useHourChartLayout = ({
	hours,
	barColor,
	width,
}: {
	hours: HourDistribution[];
	barColor: string;
	width?: number;
}): HourChartLayout | null => {
	if (hours.length === 0) return null;

	// Build full 24-hour array, filling gaps with 0
	const hourMap = new Map<number, number>();
	for (const h of hours) {
		hourMap.set(h.hour, h.sessionCount);
	}

	const allHours = Array.from({ length: 24 }, (_, i) => ({
		hour: i,
		count: hourMap.get(i) ?? 0,
	}));

	const containerWidth = width ?? DEFAULT_WIDTH;

	const maxVal = Math.max(...allHours.map((h) => h.count), 1);
	const ticks = gridTicks({ max: maxVal });
	const effectiveMax = ticks[ticks.length - 1];

	const drawArea = containerWidth - LEFT_GUTTER - 4;
	const slotWidth = drawArea / 24;
	const barWidth = Math.min(Math.max(Math.floor(slotWidth * 0.7), 3), 20);

	const svgWidth = containerWidth;
	const svgHeight = DEFAULT_CHART_HEIGHT + BOTTOM_GUTTER + TOP_PADDING;
	const drawableHeight = DEFAULT_CHART_HEIGHT;

	const gridLines: HourChartGridLine[] = ticks.map((v) => ({
		value: v,
		y: yFromValue({
			value: v,
			max: effectiveMax,
			top: TOP_PADDING,
			height: drawableHeight,
		}),
	}));

	let peakHour = 0;
	let peakCount = 0;
	const totalSessions = allHours.reduce((sum, h) => {
		if (h.count > peakCount) {
			peakHour = h.hour;
			peakCount = h.count;
		}
		return sum + h.count;
	}, 0);

	const bars: HourBar[] = allHours.map((h) => {
		const centerX = LEFT_GUTTER + h.hour * slotWidth + slotWidth / 2;
		const barHeight =
			h.count > 0
				? heightFromValue({
						value: h.count,
						max: effectiveMax,
						height: drawableHeight,
					})
				: 0;

		return {
			x: centerX - barWidth / 2,
			y:
				h.count > 0
					? yFromValue({
							value: h.count,
							max: effectiveMax,
							top: TOP_PADDING,
							height: drawableHeight,
						})
					: TOP_PADDING + drawableHeight,
			width: barWidth,
			height: barHeight,
			fill: barColor,
			hour: h.hour,
			count: h.count,
			tooltipId: `hc-${h.hour}`,
			tooltipTitle: `${HOUR_LABELS[h.hour]} (${String(h.hour).padStart(2, "0")}:00)`,
			tooltipBody: pluralize({ count: h.count, singular: "conversation" }),
			hoverX: LEFT_GUTTER + h.hour * slotWidth,
			hoverWidth: slotWidth,
		};
	});

	// Adapt label interval to chart width
	const labelInterval = containerWidth < 400 ? 6 : 3;
	const hourLabels = allHours
		.filter((h) => h.hour % labelInterval === 0)
		.map((h) => ({
			text: HOUR_LABELS[h.hour],
			x: LEFT_GUTTER + h.hour * slotWidth + slotWidth / 2,
		}));

	// Band labels centered across their hour range
	const bandLabels: HourBandLabel[] = BANDS.map((band) => {
		const startX = LEFT_GUTTER + band.startHour * slotWidth;
		const width = (band.endHour - band.startHour) * slotWidth;
		return {
			text: band.label,
			x: startX + width / 2,
			width,
		};
	});

	return {
		bars,
		bandLabels,
		hourLabels,
		gridLines,
		svgWidth,
		svgHeight,
		topPadding: TOP_PADDING,
		drawableHeight,
		leftGutter: LEFT_GUTTER,
		gridLineColor: zinc[800],
		gridLabelColor: zinc[600],
		xLabelColor: zinc[600],
		xLabelY: TOP_PADDING + drawableHeight + 12,
		bandLabelY: TOP_PADDING + drawableHeight + 24,
		totalSessions,
		peakHour,
		peakCount,
	};
};

export { useHourChartLayout };
export type { HourChartLayout, HourBar, HourBandLabel, HourChartGridLine };
