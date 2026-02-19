/**
 * Color palettes and scales for SVG visualizations.
 */

const zinc = {
	950: "#0a0a0b",
	900: "#18181b",
	800: "#27272a",
	700: "#3f3f46",
	600: "#52525b",
	500: "#71717a",
	400: "#a1a1aa",
	200: "#e4e4e7",
} as const;

const palette = {
	blue: "#60a5fa",
	amber: "#f59e0b",
	emerald: "#34d399",
	rose: "#fb7185",
	purple: "#c084fc",
	cyan: "#22d3ee",
	pink: "#f472b6",
	orange: "#fb923c",
} as const;

/**
 * Ordered color cycle for series/lane assignment. Wraps via modulo.
 */
const seriesColors: readonly string[] = [
	palette.blue,
	palette.emerald,
	palette.amber,
	palette.rose,
	palette.purple,
	palette.cyan,
	palette.pink,
	palette.orange,
];

const pickSeriesColor = ({ index }: { index: number }): string =>
	seriesColors[index % seriesColors.length];

/**
 * 4-stop amber intensity scale for heatmaps.
 */
const heatmapStops = {
	empty: zinc[800],
	low: "#451a03",
	medium: "#78350f",
	high: "#b45309",
	max: "#f59e0b",
} as const;

const heatmapColor = ({
	value,
	max,
}: {
	value: number;
	max: number;
}): string => {
	if (value === 0 || max === 0) return heatmapStops.empty;
	const ratio = value / max;
	if (ratio <= 0.25) return heatmapStops.low;
	if (ratio <= 0.5) return heatmapStops.medium;
	if (ratio <= 0.75) return heatmapStops.high;
	return heatmapStops.max;
};

export {
	zinc,
	palette,
	seriesColors,
	pickSeriesColor,
	heatmapStops,
	heatmapColor,
};
