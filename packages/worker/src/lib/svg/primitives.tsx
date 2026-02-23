/**
 * Generic SVG JSX elements. These know nothing about charts --
 * they are thin wrappers that reduce attribute boilerplate.
 */
import type { FC } from "hono/jsx";

/**
 * A rectangle with optional tooltip binding and interactivity control.
 */
type RectProps = {
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
	rx?: number;
	opacity?: number;
	/** data-popover-target value for tooltip binding. */
	tooltipId?: string;
	/** When false (default), sets pointer-events: none. */
	isInteractive?: boolean;
};

const Rect: FC<RectProps> = ({
	x,
	y,
	width,
	height,
	fill,
	rx,
	opacity,
	tooltipId,
	isInteractive,
}) => {
	return (
		<rect
			x={x}
			y={y}
			width={width}
			height={height}
			rx={rx}
			fill={fill}
			opacity={opacity}
			data-popover-target={tooltipId}
			style={isInteractive ? undefined : "pointer-events: none"}
		/>
	);
};

/**
 * A filled circle.
 */
type CircleProps = {
	cx: number;
	cy: number;
	r: number;
	fill: string;
};

const Circle: FC<CircleProps> = ({ cx, cy, r, fill }) => {
	return <circle cx={cx} cy={cy} r={r} fill={fill} />;
};

/**
 * A line segment with optional dash pattern and opacity.
 */
type LineProps = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	stroke: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	isDashed?: boolean;
	/** Custom dash pattern, e.g. "3,4". Only used when isDashed is true. */
	dashArray?: string;
};

const Line: FC<LineProps> = ({
	x1,
	y1,
	x2,
	y2,
	stroke,
	strokeWidth,
	strokeOpacity,
	isDashed,
	dashArray,
}) => {
	return (
		<line
			x1={x1}
			y1={y1}
			x2={x2}
			y2={y2}
			stroke={stroke}
			stroke-width={strokeWidth ?? 1}
			stroke-opacity={strokeOpacity}
			stroke-dasharray={isDashed ? (dashArray ?? "2,2") : undefined}
		/>
	);
};

/**
 * A text label with sensible defaults for chart use (inherits font-family).
 */
type TextProps = {
	x: number;
	y: number;
	fill: string;
	children: string | number;
	fontSize?: number;
	anchor?: "start" | "middle" | "end";
};

const Text: FC<TextProps> = ({ x, y, fill, children, fontSize, anchor }) => {
	return (
		<text
			x={x}
			y={y}
			fill={fill}
			font-size={fontSize ?? 10}
			font-family="inherit"
			text-anchor={anchor}
		>
			{children}
		</text>
	);
};

/**
 * An SVG path for drawing lines/curves. Supports both stroke and optional fill.
 */
type PathProps = {
	d: string;
	stroke: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	fill?: string;
	fillOpacity?: number;
};

const Path: FC<PathProps> = ({
	d,
	stroke,
	strokeWidth,
	strokeOpacity,
	fill,
	fillOpacity,
}) => {
	return (
		<path
			d={d}
			stroke={stroke}
			stroke-width={strokeWidth ?? 2}
			stroke-opacity={strokeOpacity}
			fill={fill ?? "none"}
			fill-opacity={fillOpacity}
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	);
};

export { Rect, Circle, Line, Text, Path };
export type { RectProps, CircleProps, LineProps, TextProps, PathProps };
