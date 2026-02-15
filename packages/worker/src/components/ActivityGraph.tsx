import type { FC } from "hono/jsx";
import type { DailySessionCount } from "../lib/db";

type ActivityGraphProps = {
	dailyCounts: DailySessionCount[];
	org: string;
	repo: string;
};

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const DAYS = 7;
const LABEL_WIDTH = 28;
const HEADER_HEIGHT = 16;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_LABELS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

const getColor = (count: number, max: number): string => {
	if (count === 0) return "#27272a";
	if (max === 0) return "#27272a";
	const ratio = count / max;
	if (ratio <= 0.25) return "#451a03";
	if (ratio <= 0.5) return "#78350f";
	if (ratio <= 0.75) return "#b45309";
	return "#f59e0b";
};

type Cell = {
	date: string;
	count: number;
	dayOfWeek: number;
	week: number;
};

const buildGrid = (dailyCounts: DailySessionCount[]): Cell[] => {
	const countMap = new Map<string, number>();
	for (const dc of dailyCounts) {
		countMap.set(dc.date, dc.count);
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayDay = today.getDay(); // 0=Sun, 6=Sat

	// We want 52 full weeks + the partial current week
	// Start from the Sunday 52 weeks ago
	const startDate = new Date(today);
	startDate.setDate(startDate.getDate() - (52 * 7 + todayDay));

	const totalDays = 52 * 7 + todayDay + 1;
	const cells: Cell[] = [];

	for (let i = 0; i < totalDays; i++) {
		const d = new Date(startDate);
		d.setDate(d.getDate() + i);
		const dateStr = d.toISOString().split("T")[0];
		const dayOfWeek = d.getDay();
		const week = Math.floor(i / 7);
		cells.push({
			date: dateStr,
			count: countMap.get(dateStr) ?? 0,
			dayOfWeek,
			week,
		});
	}

	return cells;
};

const getMonthLabels = (
	cells: Cell[],
): { label: string; week: number }[] => {
	const labels: { label: string; week: number }[] = [];
	let lastMonth = -1;

	for (const cell of cells) {
		if (cell.dayOfWeek !== 0) continue;
		const month = Number.parseInt(cell.date.split("-")[1], 10) - 1;
		if (month !== lastMonth) {
			labels.push({ label: MONTH_LABELS[month], week: cell.week });
			lastMonth = month;
		}
	}

	return labels;
};

const ActivityGraph: FC<ActivityGraphProps> = ({ dailyCounts }) => {
	const cells = buildGrid(dailyCounts);
	const maxCount = Math.max(...cells.map((c) => c.count), 1);
	const totalSessions = cells.reduce((sum, c) => sum + c.count, 0);
	const monthLabels = getMonthLabels(cells);
	const numWeeks = Math.max(...cells.map((c) => c.week)) + 1;

	const svgWidth = LABEL_WIDTH + numWeeks * CELL_STEP;
	const svgHeight = HEADER_HEIGHT + DAYS * CELL_STEP;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">
					{totalSessions}{" "}
					{totalSessions === 1 ? "conversation" : "conversations"} in the last
					year
				</span>
			</div>
			<div class="overflow-x-auto">
				<svg
					width={svgWidth}
					height={svgHeight}
					class="block"
					style="min-width: fit-content"
				>
					{/* Month labels */}
					{monthLabels.map((ml) => (
						<text
							x={LABEL_WIDTH + ml.week * CELL_STEP}
							y={10}
							fill="#71717a"
							font-size="10"
							font-family="inherit"
						>
							{ml.label}
						</text>
					))}

					{/* Day-of-week labels */}
					{DAY_LABELS.map((label, i) =>
						label ? (
							<text
								x={0}
								y={HEADER_HEIGHT + i * CELL_STEP + CELL_SIZE - 1}
								fill="#52525b"
								font-size="10"
								font-family="inherit"
							>
								{label}
							</text>
						) : null,
					)}

					{/* Cells */}
					{cells.map((cell) => (
						<rect
							x={LABEL_WIDTH + cell.week * CELL_STEP}
							y={HEADER_HEIGHT + cell.dayOfWeek * CELL_STEP}
							width={CELL_SIZE}
							height={CELL_SIZE}
							rx={2}
							fill={getColor(cell.count, maxCount)}
						>
							<title>
								{cell.date}: {cell.count}{" "}
								{cell.count === 1 ? "conversation" : "conversations"}
							</title>
						</rect>
					))}
				</svg>
			</div>
		</div>
	);
};

export { ActivityGraph };
export type { ActivityGraphProps };
