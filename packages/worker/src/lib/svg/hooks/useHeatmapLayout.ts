/**
 * Computes a fully positioned GitHub-style heatmap grid from daily activity data.
 *
 * Returns cell positions, colors, tooltip content, month/day labels, and SVG dimensions.
 * The component just renders what this returns -- no math in JSX.
 */
import type { DailyActivityCount } from "@/lib/db";
import { heatmapColor } from "@/lib/svg/colors";
import {
	formatLong,
	MONTH_LABELS,
	monthIndex,
	toDateStr,
} from "@/lib/svg/dates";
import { pluralize } from "@/lib/svg/text";

type HeatmapCell = {
	x: number;
	y: number;
	fill: string;
	tooltipId: string;
	tooltipTitle: string;
	tooltipBody: string;
};

type HeatmapLabel = {
	text: string;
	x: number;
};

type HeatmapLayout = {
	cells: HeatmapCell[];
	monthLabels: HeatmapLabel[];
	dayLabels: { text: string; y: number }[];
	svgWidth: number;
	svgHeight: number;
	cellSize: number;
	summary: string;
};

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const LABEL_WIDTH = 28;
const HEADER_HEIGHT = 16;
const DAYS = 7;
const DAY_STRINGS = ["", "Mon", "", "Wed", "", "Fri", ""];

const useHeatmapLayout = ({
	dailyCounts,
}: {
	dailyCounts: DailyActivityCount[];
}): HeatmapLayout => {
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

	const now = new Date();
	const todayUTC = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const today = new Date(todayUTC);
	const todayDay = today.getUTCDay();

	const startDate = new Date(todayUTC);
	startDate.setUTCDate(startDate.getUTCDate() - (52 * 7 + todayDay));

	const totalDays = 52 * 7 + todayDay + 1;

	type RawCell = {
		date: string;
		sessionCount: number;
		commitCount: number;
		dayOfWeek: number;
		week: number;
	};

	const rawCells: RawCell[] = [];
	for (let i = 0; i < totalDays; i++) {
		const d = new Date(startDate);
		d.setUTCDate(d.getUTCDate() + i);
		const dateStr = toDateStr({ date: d });
		const dayOfWeek = d.getUTCDay();
		const week = Math.floor(i / 7);
		const counts = countMap.get(dateStr);
		rawCells.push({
			date: dateStr,
			sessionCount: counts?.sessionCount ?? 0,
			commitCount: counts?.commitCount ?? 0,
			dayOfWeek,
			week,
		});
	}

	const maxCount = Math.max(...rawCells.map((c) => c.sessionCount), 1);
	const totalSessions = rawCells.reduce((sum, c) => sum + c.sessionCount, 0);
	const numWeeks = Math.max(...rawCells.map((c) => c.week)) + 1;

	const cells: HeatmapCell[] = rawCells.map((c) => {
		const isActive = c.sessionCount > 0 || c.commitCount > 0;
		return {
			x: LABEL_WIDTH + c.week * CELL_STEP,
			y: HEADER_HEIGHT + c.dayOfWeek * CELL_STEP,
			fill: heatmapColor({ value: c.sessionCount, max: maxCount }),
			tooltipId: `ag-${c.date}`,
			tooltipTitle: formatLong({ dateStr: c.date }),
			tooltipBody: isActive
				? `${pluralize({ count: c.sessionCount, singular: "conversation" })} / ${pluralize({ count: c.commitCount, singular: "commit" })}`
				: "No activity",
		};
	});

	const monthLabels: HeatmapLabel[] = [];
	let lastMonth = -1;
	for (const c of rawCells) {
		if (c.dayOfWeek !== 0) continue;
		const mi = monthIndex({ dateStr: c.date });
		if (mi !== lastMonth) {
			monthLabels.push({
				text: MONTH_LABELS[mi],
				x: LABEL_WIDTH + c.week * CELL_STEP,
			});
			lastMonth = mi;
		}
	}

	const dayLabels = DAY_STRINGS.map((text, i) =>
		text ? { text, y: HEADER_HEIGHT + i * CELL_STEP + CELL_SIZE - 1 } : null,
	).filter((d): d is { text: string; y: number } => d !== null);

	return {
		cells,
		monthLabels,
		dayLabels,
		svgWidth: LABEL_WIDTH + numWeeks * CELL_STEP,
		svgHeight: HEADER_HEIGHT + DAYS * CELL_STEP,
		cellSize: CELL_SIZE,
		summary: `${pluralize({ count: totalSessions, singular: "conversation" })} in the last year`,
	};
};

export { useHeatmapLayout };
export type { HeatmapLayout, HeatmapCell, HeatmapLabel };
