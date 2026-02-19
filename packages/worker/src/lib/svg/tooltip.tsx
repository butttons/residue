/**
 * Popover-based tooltip for SVG charts.
 *
 * Uses the HTML Popover API (`popover="manual"`) with `data-popover-target`
 * attributes on SVG elements. The shared script in Layout.tsx handles
 * show/hide positioning on hover.
 *
 * @example
 * ```tsx
 * // On an SVG element:
 * <Rect ... tooltipId="tip-1" isInteractive />
 *
 * // Below the SVG:
 * <Tooltip id="tip-1" title="Mar 14, 2025" body="3 commits" />
 * ```
 */
import type { FC } from "hono/jsx";

/**
 * A positioned popover tooltip with a title line and a body line.
 * Styled via `.activity-tooltip` CSS in styles.css.
 */
type TooltipProps = {
	id: string;
	title: string;
	body: string;
};

const Tooltip: FC<TooltipProps> = ({ id, title, body }) => {
	return (
		<div popover="manual" id={id} class="activity-tooltip">
			<span class="activity-tooltip-date">{title}</span>
			<span class="activity-tooltip-counts">{body}</span>
		</div>
	);
};

export { Tooltip };
export type { TooltipProps };
