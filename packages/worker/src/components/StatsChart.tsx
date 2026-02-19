import type { FC } from "hono/jsx";
import type { DailyActivityCount } from "../lib/db";

type StatsChartProps = {
	dailyCounts: DailyActivityCount[];
};

type WeekBucket = {
	weekStart: string;
	label: string;
	sessionCount: number;
	commitCount: number;
};

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

const CHART_HEIGHT = 120;
const LEFT_GUTTER = 28;
const TOP_PADDING = 8;
const BOTTOM_GUTTER = 20;
const CONTAINER_WIDTH = 700;

const getWeekStart = (dateStr: string): string => {
	const [year, month, day] = dateStr.split("-").map(Number);
	const d = new Date(Date.UTC(year, month - 1, day));
	const dayOfWeek = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() - dayOfWeek);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
};

const formatWeekLabel = (dateStr: string): string => {
	const [, month, day] = dateStr.split("-").map(Number);
	return `${MONTH_LABELS[month - 1]} ${day}`;
};

const bucketByWeek = (dailyCounts: DailyActivityCount[]): WeekBucket[] => {
	const map = new Map<string, { sessionCount: number; commitCount: number }>();

	for (const dc of dailyCounts) {
		const ws = getWeekStart(dc.date);
		const existing = map.get(ws);
		if (existing) {
			existing.sessionCount += dc.sessionCount;
			existing.commitCount += dc.commitCount;
		} else {
			map.set(ws, {
				sessionCount: dc.sessionCount,
				commitCount: dc.commitCount,
			});
		}
	}

	const allWeeks = [...map.keys()].sort();
	if (allWeeks.length === 0) return [];

	const firstWeek = allWeeks[0];
	const lastWeek = allWeeks[allWeeks.length - 1];

	const [fy, fm, fd] = firstWeek.split("-").map(Number);
	const [ly, lm, ld] = lastWeek.split("-").map(Number);

	const start = new Date(Date.UTC(fy, fm - 1, fd));
	const end = new Date(Date.UTC(ly, lm - 1, ld));

	const result: WeekBucket[] = [];
	const cursor = new Date(start);

	while (cursor <= end) {
		const y = cursor.getUTCFullYear();
		const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
		const d = String(cursor.getUTCDate()).padStart(2, "0");
		const key = `${y}-${m}-${d}`;
		const data = map.get(key);
		result.push({
			weekStart: key,
			label: formatWeekLabel(key),
			sessionCount: data?.sessionCount ?? 0,
			commitCount: data?.commitCount ?? 0,
		});
		cursor.setUTCDate(cursor.getUTCDate() + 7);
	}

	return result;
};

const computeGridLines = (max: number): number[] => {
	if (max <= 0) return [0];
	if (max <= 4) {
		const lines: number[] = [];
		for (let i = 0; i <= max; i++) lines.push(i);
		return lines;
	}
	const step =
		max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
	const lines: number[] = [0];
	let v = step;
	while (v <= max) {
		lines.push(v);
		v += step;
	}
	if (lines[lines.length - 1] < max) {
		lines.push(max);
	}
	return lines;
};

const MAX_WEEKS = 26;

const StatsChart: FC<StatsChartProps> = ({ dailyCounts }) => {
	const allBuckets = bucketByWeek(dailyCounts);

	const buckets =
		allBuckets.length > MAX_WEEKS
			? allBuckets.slice(allBuckets.length - MAX_WEEKS)
			: allBuckets;

	if (buckets.length === 0) return <span />;

	const maxVal = Math.max(
		...buckets.map((b) => Math.max(b.sessionCount, b.commitCount)),
		1,
	);
	const gridLines = computeGridLines(maxVal);
	const effectiveMax = gridLines[gridLines.length - 1];

	// Dynamically size bars to fill the available width
	const drawArea = CONTAINER_WIDTH - LEFT_GUTTER - 4;
	const groupWidth = Math.floor(drawArea / Math.max(buckets.length, 1));
	// Each group: [barGap] [commit bar] [inner gap] [session bar] [barGap]
	// Bar width is roughly 35% of group width, capped for aesthetics
	const barWidth = Math.min(Math.max(Math.floor(groupWidth * 0.35), 4), 24);
	const innerGap = Math.max(Math.floor(barWidth * 0.3), 2);

	const svgWidth = CONTAINER_WIDTH;
	const svgHeight = CHART_HEIGHT + BOTTOM_GUTTER + TOP_PADDING;
	const drawableHeight = CHART_HEIGHT;

	const barY = (value: number): number => {
		const ratio = value / effectiveMax;
		return TOP_PADDING + drawableHeight - ratio * drawableHeight;
	};

	const barHeight = (value: number): number => {
		return (value / effectiveMax) * drawableHeight;
	};

	const totalSessions = buckets.reduce((s, b) => s + b.sessionCount, 0);
	const totalCommits = buckets.reduce((s, b) => s + b.commitCount, 0);

	// Label interval: show every Nth label so they don't overlap
	const labelCharWidth = 6;
	const labelPixels = 7 * labelCharWidth; // e.g. "Feb 15" ~ 7 chars
	const minLabelGap = labelPixels + 8;
	const labelInterval = Math.max(1, Math.ceil(minLabelGap / groupWidth));

	// Pair width (the two bars + inner gap), centered in each group slot
	const pairWidth = barWidth * 2 + innerGap;

	return (
		<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs text-zinc-400">Weekly activity</span>
				<div class="flex items-center gap-4 text-xs text-zinc-500">
					<span class="flex items-center gap-1.5">
						<span
							class="w-2.5 h-2.5 rounded-sm inline-block"
							style="background: #60a5fa"
						/>
						{totalCommits} {totalCommits === 1 ? "commit" : "commits"}
					</span>
					<span class="flex items-center gap-1.5">
						<span
							class="w-2.5 h-2.5 rounded-sm inline-block"
							style="background: #f59e0b"
						/>
						{totalSessions}{" "}
						{totalSessions === 1 ? "conversation" : "conversations"}
					</span>
				</div>
			</div>
			<div class="overflow-x-auto">
				<svg
					width="100%"
					viewBox={`0 0 ${svgWidth} ${svgHeight}`}
					preserveAspectRatio="xMinYMid meet"
					class="block"
				>
					{/* Grid lines */}
					{gridLines.map((v) => {
						const y = barY(v);
						return (
							<>
								<line
									x1={LEFT_GUTTER}
									y1={y}
									x2={svgWidth}
									y2={y}
									stroke="#27272a"
									stroke-width={1}
								/>
								<text
									x={LEFT_GUTTER - 4}
									y={y + 3}
									fill="#52525b"
									font-size="9"
									font-family="inherit"
									text-anchor="end"
								>
									{v}
								</text>
							</>
						);
					})}

					{/* Bars */}
					{buckets.map((bucket, i) => {
						const groupCenter = LEFT_GUTTER + i * groupWidth + groupWidth / 2;
						const pairStart = groupCenter - pairWidth / 2;
						const commitX = pairStart;
						const sessionX = pairStart + barWidth + innerGap;

						return (
							<>
								{/* Hover target covering the full group */}
								<rect
									x={LEFT_GUTTER + i * groupWidth}
									y={TOP_PADDING}
									width={groupWidth}
									height={drawableHeight}
									fill="transparent"
									data-popover-target={`sc-${bucket.weekStart}`}
								/>
								{/* Commit bar */}
								{bucket.commitCount > 0 && (
									<rect
										x={commitX}
										y={barY(bucket.commitCount)}
										width={barWidth}
										height={barHeight(bucket.commitCount)}
										rx={2}
										fill="#60a5fa"
										opacity="0.85"
										style="pointer-events: none"
									/>
								)}
								{/* Session bar */}
								{bucket.sessionCount > 0 && (
									<rect
										x={sessionX}
										y={barY(bucket.sessionCount)}
										width={barWidth}
										height={barHeight(bucket.sessionCount)}
										rx={2}
										fill="#f59e0b"
										opacity="0.85"
										style="pointer-events: none"
									/>
								)}
							</>
						);
					})}

					{/* X-axis labels */}
					{buckets.map((bucket, i) => {
						if (i % labelInterval !== 0) return null;
						const groupCenter = LEFT_GUTTER + i * groupWidth + groupWidth / 2;
						return (
							<text
								x={groupCenter}
								y={TOP_PADDING + drawableHeight + 14}
								fill="#52525b"
								font-size="9"
								font-family="inherit"
								text-anchor="middle"
							>
								{bucket.label}
							</text>
						);
					})}
				</svg>

				{/* Popover tooltips */}
				{buckets.map((bucket) => (
					<div
						popover="manual"
						id={`sc-${bucket.weekStart}`}
						class="activity-tooltip"
					>
						<span class="activity-tooltip-date">Week of {bucket.label}</span>
						<span class="activity-tooltip-counts">
							{bucket.commitCount}{" "}
							{bucket.commitCount === 1 ? "commit" : "commits"}
							{" / "}
							{bucket.sessionCount}{" "}
							{bucket.sessionCount === 1 ? "conversation" : "conversations"}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};

export { StatsChart };
export type { StatsChartProps };
