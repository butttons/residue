import type { FC } from "hono/jsx";
import type { DailyActivityCount } from "../lib/db";

type ActivityGraphProps = {
	dailyCounts: DailyActivityCount[];
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

const getColor = (sessionCount: number, max: number): string => {
	if (sessionCount === 0) return "#27272a";
	if (max === 0) return "#27272a";
	const ratio = sessionCount / max;
	if (ratio <= 0.25) return "#451a03";
	if (ratio <= 0.5) return "#78350f";
	if (ratio <= 0.75) return "#b45309";
	return "#f59e0b";
};

type Cell = {
	date: string;
	sessionCount: number;
	commitCount: number;
	dayOfWeek: number;
	week: number;
};

const formatDate = (dateStr: string): string => {
	const [year, month, day] = dateStr.split("-");
	const monthName = MONTH_LABELS[Number.parseInt(month, 10) - 1];
	return `${monthName} ${Number.parseInt(day, 10)}, ${year}`;
};

const buildGrid = (dailyCounts: DailyActivityCount[]): Cell[] => {
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

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayDay = today.getDay();

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
		const counts = countMap.get(dateStr);
		cells.push({
			date: dateStr,
			sessionCount: counts?.sessionCount ?? 0,
			commitCount: counts?.commitCount ?? 0,
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

const pluralize = (count: number, singular: string): string => {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
};

const ActivityGraph: FC<ActivityGraphProps> = ({ dailyCounts }) => {
	const cells = buildGrid(dailyCounts);
	const maxCount = Math.max(...cells.map((c) => c.sessionCount), 1);
	const totalSessions = cells.reduce((sum, c) => sum + c.sessionCount, 0);
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
			<div class="overflow-x-auto activity-graph-container">
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
							fill={getColor(cell.sessionCount, maxCount)}
							data-popover-target={`ag-${cell.date}`}
						/>
					))}
				</svg>

				{/* Popover tooltip elements */}
				{cells.map((cell) => {
					const isActive =
						cell.sessionCount > 0 || cell.commitCount > 0;
					return (
						<div
							popover="manual"
							id={`ag-${cell.date}`}
							class="activity-tooltip"
						>
							<span class="activity-tooltip-date">
								{formatDate(cell.date)}
							</span>
							{isActive ? (
								<span class="activity-tooltip-counts">
									{pluralize(cell.sessionCount, "conversation")}
									{" / "}
									{pluralize(cell.commitCount, "commit")}
								</span>
							) : (
								<span class="activity-tooltip-counts">No activity</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export { ActivityGraph };
export type { ActivityGraphProps };
