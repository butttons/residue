import type { FC } from "hono/jsx";
import type { ContributorRow } from "@/lib/db";
import { relativeTime } from "@/lib/time";

type ContributorsProps = {
	contributors: ContributorRow[];
};

const Contributors: FC<ContributorsProps> = ({ contributors }) => {
	if (contributors.length === 0) return <span />;

	return (
		<div class="mb-6">
			<h2 class="text-xs text-zinc-400 mb-3">Contributors</h2>
			<div class="bg-zinc-900 border border-zinc-800 rounded-md divide-y divide-zinc-800/50">
				{contributors.map((c) => (
					<div class="flex items-center justify-between px-4 py-3">
						<div class="flex items-center gap-2.5">
							<div class="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 font-medium flex-shrink-0">
								{c.author.charAt(0).toUpperCase()}
							</div>
							<span class="text-sm text-zinc-100 font-medium">{c.author}</span>
						</div>
						<div class="flex items-center gap-4 text-xs text-zinc-500">
							<span class="flex items-center gap-1">
								<i class="ph ph-git-commit text-sm text-zinc-500" />
								<span class="text-zinc-300">{c.commitCount}</span>
								{c.commitCount === 1 ? " commit" : " commits"}
							</span>
							<span class="flex items-center gap-1">
								<i class="ph ph-chats-circle text-sm text-zinc-500" />
								<span class="text-zinc-300">{c.sessionCount}</span>
								{c.sessionCount === 1 ? " conversation" : " conversations"}
							</span>
							{c.lastActive && (
								<span class="hidden sm:flex items-center gap-1 text-zinc-600">
									<i class="ph ph-clock text-sm" />
									{relativeTime(c.lastActive)}
								</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export { Contributors };
export type { ContributorsProps };
