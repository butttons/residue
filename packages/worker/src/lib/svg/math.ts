/**
 * Pure math for chart layout: grid ticks, value-to-pixel mapping, label spacing.
 */

/**
 * Compute nice Y-axis grid tick values from 0 up to (at least) max.
 * Small ranges get every integer; larger ranges pick a round step size.
 */
const gridTicks = ({ max }: { max: number }): number[] => {
	if (max <= 0) return [0];
	if (max <= 4) {
		const ticks: number[] = [];
		for (let i = 0; i <= max; i++) ticks.push(i);
		return ticks;
	}
	const step =
		max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
	const ceiling = Math.ceil(max / step) * step;
	const ticks: number[] = [0];
	let v = step;
	while (v <= ceiling) {
		ticks.push(v);
		v += step;
	}
	return ticks;
};

/** Y pixel for a value. 0 -> bottom edge, max -> top edge. */
const yFromValue = ({
	value,
	max,
	top,
	height,
}: {
	value: number;
	max: number;
	top: number;
	height: number;
}): number => top + height - (value / max) * height;

/** Pixel height of a bar for a given value. */
const heightFromValue = ({
	value,
	max,
	height,
}: {
	value: number;
	max: number;
	height: number;
}): number => (value / max) * height;

/**
 * How often to show X-axis labels so they don't overlap.
 * Returns an interval N -- show every Nth label.
 */
const labelStep = ({
	slotWidth,
	labelWidth,
	gap,
}: {
	slotWidth: number;
	labelWidth: number;
	gap?: number;
}): number => Math.max(1, Math.ceil((labelWidth + (gap ?? 8)) / slotWidth));

export { gridTicks, yFromValue, heightFromValue, labelStep };
