import type { FC } from "hono/jsx";
import type { TimeStats } from "@/lib/db";

type TimeStatsCardsProps = {
	timeStats: TimeStats;
};

const formatDuration = ({ minutes }: { minutes: number }): string => {
	if (minutes < 1) return "< 1m";
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatHours = ({ hours }: { hours: number }): string => {
	if (hours < 1) return `${Math.round(hours * 60)}m`;
	if (hours < 10) return `${hours.toFixed(1)}h`;
	return `${Math.round(hours)}h`;
};

const TimeStatsCards: FC<TimeStatsCardsProps> = ({ timeStats }) => {
	if (timeStats.totalSessions === 0) return <span />;

	return (
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 flex flex-col gap-1">
				<div class="flex items-center gap-1.5 text-zinc-500 text-xs">
					<i class="ph ph-timer text-sm" />
					Total AI time
				</div>
				<span class="text-xl font-bold text-zinc-100">
					{formatHours({ hours: timeStats.totalHours })}
				</span>
				<span class="text-xs text-zinc-500">
					across {timeStats.totalSessions} sessions
				</span>
			</div>

			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 flex flex-col gap-1">
				<div class="flex items-center gap-1.5 text-zinc-500 text-xs">
					<i class="ph ph-clock-countdown text-sm" />
					Avg duration
				</div>
				<span class="text-xl font-bold text-zinc-100">
					{formatDuration({ minutes: timeStats.avgDurationMinutes })}
				</span>
				{timeStats.medianDurationMinutes > 0 && (
					<span class="text-xs text-zinc-500">
						median{" "}
						{formatDuration({ minutes: timeStats.medianDurationMinutes })}
					</span>
				)}
			</div>

			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 flex flex-col gap-1">
				<div class="flex items-center gap-1.5 text-zinc-500 text-xs">
					<i class="ph ph-medal text-sm" />
					Longest session
				</div>
				<span class="text-xl font-bold text-zinc-100">
					{formatDuration({ minutes: timeStats.longestDurationMinutes })}
				</span>
			</div>

			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 flex flex-col gap-1">
				<div class="flex items-center gap-1.5 text-zinc-500 text-xs">
					<i class="ph ph-clock-afternoon text-sm" />
					Avg per day
				</div>
				<span class="text-xl font-bold text-zinc-100">
					{formatHours({
						hours:
							timeStats.totalSessions > 0
								? Math.round(
										(timeStats.totalHours / timeStats.totalSessions) * 10,
									) / 10
								: 0,
					})}
				</span>
				<span class="text-xs text-zinc-500">per session</span>
			</div>
		</div>
	);
};

export { TimeStatsCards };
export type { TimeStatsCardsProps };
