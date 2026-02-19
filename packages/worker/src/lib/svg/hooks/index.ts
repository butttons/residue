/**
 * Layout hooks for SVG charts.
 *
 * Pure functions that take raw data and return fully computed layout
 * objects -- positions, sizes, colors, labels. Components just render
 * what these return; no math in JSX.
 *
 * These are "hooks" in the sense of computed derivations, not React hooks.
 * They run once at render time on the server.
 */

export type {
	BarChartLayout,
	BarGroup,
	GridLine,
} from "@/lib/svg/hooks/useBarChartLayout";
export { useBarChartLayout } from "@/lib/svg/hooks/useBarChartLayout";
export type {
	CommitGraphDot,
	CommitGraphInput,
	CommitGraphLayout,
	CommitGraphLine,
} from "@/lib/svg/hooks/useCommitGraphLayout";
export { useCommitGraphLayout } from "@/lib/svg/hooks/useCommitGraphLayout";
export type {
	HeatmapCell,
	HeatmapLabel,
	HeatmapLayout,
} from "@/lib/svg/hooks/useHeatmapLayout";
export { useHeatmapLayout } from "@/lib/svg/hooks/useHeatmapLayout";
