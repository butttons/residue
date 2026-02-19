/**
 * Server-side SVG chart library.
 *
 * Pure utilities for building SVG visualizations rendered as Hono JSX.
 * No client-side charting libraries.
 *
 * @module
 *
 * **colors** -- Palettes, heatmap scales, series color cycling.
 *
 * **dates** -- UTC date formatting, month labels, week-start computation.
 *
 * **math** -- Grid ticks, value-to-pixel mapping, label spacing.
 *
 * **text** -- Pluralization and label formatting.
 *
 * **primitives** -- Generic SVG JSX elements (Rect, Circle, Line, Text).
 *
 * **tooltip** -- Popover-based tooltip component.
 *
 * **hooks/** -- Layout functions that compute all chart positions and sizes.
 */

export {
	heatmapColor,
	heatmapStops,
	palette,
	pickSeriesColor,
	seriesColors,
	zinc,
} from "@/lib/svg/colors";

export {
	formatLong,
	formatShort,
	MONTH_LABELS,
	monthIndex,
	toDateStr,
	weekStart,
} from "@/lib/svg/dates";
export type {
	BarChartLayout,
	BarGroup,
	CommitGraphDot,
	CommitGraphInput,
	CommitGraphLayout,
	CommitGraphLine,
	GridLine,
	HeatmapCell,
	HeatmapLabel,
	HeatmapLayout,
} from "@/lib/svg/hooks";
export {
	useBarChartLayout,
	useCommitGraphLayout,
	useHeatmapLayout,
} from "@/lib/svg/hooks";
export {
	gridTicks,
	heightFromValue,
	labelStep,
	yFromValue,
} from "@/lib/svg/math";
export type {
	CircleProps,
	LineProps,
	RectProps,
	TextProps,
} from "@/lib/svg/primitives";
export { Circle, Line, Rect, Text } from "@/lib/svg/primitives";
export { pluralize } from "@/lib/svg/text";
export type { TooltipProps } from "@/lib/svg/tooltip";
export { Tooltip } from "@/lib/svg/tooltip";
