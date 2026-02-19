/**
 * UTC date formatting helpers for chart data processing.
 */

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
] as const;

/** "YYYY-MM-DD" from a Date in UTC. */
const toDateStr = ({ date }: { date: Date }): string => {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

/** "Mar 14, 2025" from "2025-03-14". */
const formatLong = ({ dateStr }: { dateStr: string }): string => {
	const [year, month, day] = dateStr.split("-");
	const name = MONTH_LABELS[Number.parseInt(month, 10) - 1];
	return `${name} ${Number.parseInt(day, 10)}, ${year}`;
};

/** "Mar 14" from "2025-03-14". */
const formatShort = ({ dateStr }: { dateStr: string }): string => {
	const [, month, day] = dateStr.split("-").map(Number);
	return `${MONTH_LABELS[month - 1]} ${day}`;
};

/** 0-based month index from "YYYY-MM-DD". */
const monthIndex = ({ dateStr }: { dateStr: string }): number =>
	Number.parseInt(dateStr.split("-")[1], 10) - 1;

/** Sunday week-start "YYYY-MM-DD" for a given "YYYY-MM-DD". */
const weekStart = ({ dateStr }: { dateStr: string }): string => {
	const [y, m, d] = dateStr.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
	return toDateStr({ date: dt });
};

export {
	MONTH_LABELS,
	toDateStr,
	formatLong,
	formatShort,
	monthIndex,
	weekStart,
};
