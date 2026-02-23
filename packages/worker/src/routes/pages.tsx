import { getMapper } from "@residue/adapter/mappers";
import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ActivityGraph } from "../components/ActivityGraph";
import { AgentBreakdownChart } from "../components/AgentBreakdownChart";
import { CommitGraph } from "../components/CommitGraph";
import { Contributors } from "../components/Contributors";
import type { ContinuationLink } from "../components/Conversation";
import { Conversation } from "../components/Conversation";
import { Layout } from "../components/Layout";
import { Minimap } from "../components/Minimap";
import { StatsChart } from "../components/StatsChart";
import type {
	AgentBreakdown,
	CommitWithSessionRow,
	GlobalStats,
	RecentCommitRow,
} from "../lib/db";
import { computeGraph } from "../lib/graph";
import { formatTimestamp, relativeTime } from "../lib/time";
import { urls } from "../lib/urls";
import type { AppEnv } from "../types";

// --- Shared sub-components ---

type GroupedCommit = {
	sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	sessions: { id: string; agent: string }[];
};

type AgentCount = { agent: string; count: number };

const getAgentCounts = (
	sessions: { id: string; agent: string }[],
): AgentCount[] => {
	const map = new Map<string, number>();
	for (const s of sessions) {
		map.set(s.agent, (map.get(s.agent) ?? 0) + 1);
	}
	return [...map.entries()].map(([agent, count]) => ({ agent, count }));
};

const AgentBadges: FC<{ sessions: { id: string; agent: string }[] }> = ({
	sessions,
}) => {
	const counts = getAgentCounts(sessions);
	return (
		<>
			{counts.map((ac) => (
				<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
					{ac.agent}
					{ac.count > 1 ? ` x${ac.count}` : ""}
				</span>
			))}
		</>
	);
};

const groupCommits = (rows: CommitWithSessionRow[]): GroupedCommit[] => {
	const map = new Map<string, GroupedCommit>();

	for (const row of rows) {
		const existing = map.get(row.commit_sha);
		if (existing) {
			const isAlreadyLinked = existing.sessions.some(
				(s) => s.id === row.session_id,
			);
			if (!isAlreadyLinked) {
				existing.sessions.push({ id: row.session_id, agent: row.agent });
			}
		} else {
			map.set(row.commit_sha, {
				sha: row.commit_sha,
				message: row.message,
				author: row.author,
				committed_at: row.committed_at,
				branch: row.branch,
				sessions: [{ id: row.session_id, agent: row.agent }],
			});
		}
	}

	return [...map.values()];
};

// --- Pages app ---

const pages = new Hono<AppEnv>();

// --- Home page sub-components ---

const StatCard: FC<{
	label: string;
	value: string | number;
	icon: string;
	detail?: string;
}> = ({ label, value, icon, detail }) => (
	<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 flex flex-col gap-1">
		<div class="flex items-center gap-1.5 text-zinc-500 text-xs">
			<i class={`ph ph-${icon} text-sm`} />
			{label}
		</div>
		<span class="text-xl font-bold text-zinc-100">{value}</span>
		{detail && <span class="text-xs text-zinc-500">{detail}</span>}
	</div>
);

const StatsBar: FC<{ stats: GlobalStats }> = ({ stats }) => (
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
		<StatCard
			label="Conversations"
			value={stats.totalSessions.toLocaleString()}
			icon="chats-circle"
		/>
		<StatCard
			label="Commits"
			value={stats.totalCommits.toLocaleString()}
			icon="git-commit"
		/>
		<StatCard
			label="Repos"
			value={stats.totalRepos.toLocaleString()}
			icon="folder-simple"
		/>
		<StatCard
			label="Files changed"
			value={stats.totalFilesChanged.toLocaleString()}
			icon="file-code"
			detail={`+${stats.totalLinesAdded.toLocaleString()} / -${stats.totalLinesDeleted.toLocaleString()}`}
		/>
	</div>
);

const RecentActivity: FC<{
	commits: RecentCommitRow[];
}> = ({ commits }) => {
	if (commits.length === 0) return <span />;

	// Group by commit SHA to aggregate sessions/agents per commit
	const grouped = new Map<
		string,
		{
			sha: string;
			message: string | null;
			author: string | null;
			committedAt: number | null;
			branch: string | null;
			org: string;
			repo: string;
			agents: Set<string>;
		}
	>();

	for (const row of commits) {
		const existing = grouped.get(row.commit_sha);
		if (existing) {
			existing.agents.add(row.agent);
		} else {
			grouped.set(row.commit_sha, {
				sha: row.commit_sha,
				message: row.message,
				author: row.author,
				committedAt: row.committed_at,
				branch: row.branch,
				org: row.org,
				repo: row.repo,
				agents: new Set([row.agent]),
			});
		}
	}

	const uniqueCommits = [...grouped.values()];

	return (
		<div class="mb-6">
			<h2 class="text-xs text-zinc-400 mb-3">Recent activity</h2>
			<div class="bg-zinc-900 border border-zinc-800 rounded-md divide-y divide-zinc-800/50">
				{uniqueCommits.map((commit) => (
					<a
						href={`/app/${commit.org}/${commit.repo}/${commit.sha}`}
						class="flex items-start gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors"
					>
						<span class="text-blue-500 font-mono text-sm flex-shrink-0 mt-0.5">
							{commit.sha.slice(0, 7)}
						</span>
						<div class="flex-1 min-w-0">
							<p class="text-zinc-100 text-sm truncate">
								{commit.message ?? "No message"}
							</p>
							<div class="flex items-center gap-2 mt-1 text-xs text-zinc-500 flex-wrap">
								<span class="font-mono text-zinc-400">
									{commit.org}/{commit.repo}
								</span>
								{commit.branch && (
									<>
										<span class="text-zinc-700">&middot;</span>
										<span class="font-mono">
											<i class="ph ph-git-branch text-[10px] mr-0.5" />
											{commit.branch}
										</span>
									</>
								)}
								<span class="text-zinc-700">&middot;</span>
								<span>{commit.author}</span>
								{commit.committedAt && (
									<>
										<span class="text-zinc-700">&middot;</span>
										<span>{relativeTime(commit.committedAt)}</span>
									</>
								)}
							</div>
						</div>
						<div class="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
							{[...commit.agents].map((agent) => (
								<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
									{agent}
								</span>
							))}
						</div>
					</a>
				))}
			</div>
		</div>
	);
};

// Home page — dashboard
pages.get("/", async (c) => {
	const { DL } = c.var;
	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const [
		orgsResult,
		dailyCountsResult,
		statsResult,
		agentBreakdownResult,
		recentCommitsResult,
		contributorsResult,
	] = await Promise.all([
		DL.orgs.getList(),
		DL.stats.getDailyActivityCountsGlobal({ since: oneYearAgo }),
		DL.stats.getGlobalStats(),
		DL.stats.getAgentBreakdown(),
		DL.stats.getRecentCommits({ limit: 15 }),
		DL.stats.getContributors({ scope: "global" }),
	]);
	const orgs = orgsResult.isOk ? orgsResult.value : [];
	const dailyCounts = dailyCountsResult.isOk ? dailyCountsResult.value : [];
	const stats: GlobalStats = statsResult.isOk
		? statsResult.value
		: {
				totalSessions: 0,
				totalCommits: 0,
				totalRepos: 0,
				totalFilesChanged: 0,
				totalLinesAdded: 0,
				totalLinesDeleted: 0,
			};
	const agentBreakdown = agentBreakdownResult.isOk
		? agentBreakdownResult.value
		: [];
	const recentCommits = recentCommitsResult.isOk
		? recentCommitsResult.value
		: [];
	const contributors = contributorsResult.isOk ? contributorsResult.value : [];
	const username = c.get("username");

	return c.html(
		<Layout title="residue" username={username}>
			{orgs.length === 0 ? (
				<p class="text-zinc-400">
					No sessions uploaded yet. Run{" "}
					<code class="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-sm">
						residue init
					</code>{" "}
					in a repo to get started.
				</p>
			) : (
				<>
					<StatsBar stats={stats} />

					<ActivityGraph dailyCounts={dailyCounts} />

					<StatsChart dailyCounts={dailyCounts} />

					{agentBreakdown.length > 1 && (
						<AgentBreakdownChart agents={agentBreakdown} />
					)}

					<Contributors contributors={contributors} />

					<div class="mb-6">
						<h2 class="text-xs text-zinc-400 mb-3">Organizations</h2>
						<div class="flex flex-col gap-3">
							{orgs.map((org) => (
								<a
									href={`/app/${org.org}`}
									class="block bg-zinc-900 border border-zinc-800 rounded-md p-4 hover:border-zinc-700 transition-colors"
								>
									<div class="flex items-center justify-between">
										<span class="text-zinc-100 font-medium">{org.org}</span>
										<span class="text-zinc-400 text-sm">
											{org.repo_count} {org.repo_count === 1 ? "repo" : "repos"}
										</span>
									</div>
									{org.last_activity && (
										<span class="text-zinc-500 text-xs mt-1 block">
											{relativeTime(org.last_activity)}
										</span>
									)}
								</a>
							))}
						</div>
					</div>

					<RecentActivity commits={recentCommits} />
				</>
			)}
		</Layout>,
	);
});

// Search results page
pages.get("/search", async (c) => {
	const q = c.req.query("q")?.trim();
	const username = c.get("username");

	if (!q) {
		return c.html(
			<Layout
				title="Search — residue"
				username={username}
				breadcrumbs={[{ label: "search" }]}
			>
				<p class="text-zinc-400 text-sm">
					Enter a query in the search bar above.
				</p>
			</Layout>,
		);
	}

	type SearchResultData = {
		sessionId: string;
		score: number;
		snippets: string[];
		session: {
			agent: string;
			firstMessage: string | null;
			sessionName: string | null;
			createdAt: number;
		};
		commits: {
			sha: string;
			message: string | null;
			author: string | null;
			committedAt: number | null;
			org: string;
			repo: string;
			branch: string | null;
		}[];
	};

	let results: SearchResultData[] = [];
	let hasError = false;

	try {
		const searchResponse = await c.env.AI.autorag("residue-search").search({
			query: q,
			max_num_results: 10,
		});

		// Parse session IDs from filenames (search/<id>.txt)
		const parsed = searchResponse.data.map((item) => {
			const match = item.filename.match(/^search\/(.+)\.txt$/);
			const sessionId = match ? match[1] : null;
			const snippets = item.content
				.filter((block) => block.type === "text")
				.map((block) => block.text);
			return { sessionId, score: item.score, snippets };
		});

		// Look up session details from D1
		const enriched = await Promise.all(
			parsed
				.filter(
					(p): p is typeof p & { sessionId: string } => p.sessionId !== null,
				)
				.map(async ({ sessionId, score, snippets }) => {
					const detailResult = await c.var.DL.sessions.getDetail(sessionId);
					const detail = detailResult.isOk ? detailResult.value : null;
					if (!detail) return null;
					return {
						sessionId,
						score,
						snippets,
						session: {
							agent: detail.session.agent,
							firstMessage: detail.session.first_message,
							sessionName: detail.session.session_name,
							createdAt: detail.session.created_at,
						},
						commits: detail.commits.map((commit) => ({
							sha: commit.commit_sha,
							message: commit.message,
							author: commit.author,
							committedAt: commit.committed_at,
							org: commit.org,
							repo: commit.repo,
							branch: commit.branch,
						})),
					} satisfies SearchResultData;
				}),
		);

		results = enriched.filter((r): r is SearchResultData => r !== null);
	} catch {
		hasError = true;
	}

	return c.html(
		<Layout
			title={`"${q}" — Search — residue`}
			username={username}
			breadcrumbs={[{ label: "search" }]}
			searchQuery={q}
		>
			<h1 class="text-sm text-zinc-400 mb-6">
				{hasError ? (
					<span class="text-red-400">
						Search failed. Make sure AI Search is configured.
					</span>
				) : (
					<>
						{results.length} {results.length === 1 ? "result" : "results"} for{" "}
						<span class="text-zinc-100">"{q}"</span>
					</>
				)}
			</h1>

			{!hasError && results.length === 0 && (
				<p class="text-zinc-500 text-sm">No matching sessions found.</p>
			)}

			{results.length > 0 && (
				<div class="flex flex-col gap-3">
					{results.map((result) => {
						// Link to the first commit's detail page, or fall back to nothing
						const firstCommit = result.commits[0];
						const href = firstCommit
							? `/app/${firstCommit.org}/${firstCommit.repo}/${firstCommit.sha}`
							: undefined;

						return (
							<a
								href={href}
								class="block bg-zinc-900 border border-zinc-800 rounded-md p-4 hover:border-zinc-700 transition-colors"
							>
								{/* Session header */}
								<div class="flex items-center gap-2 mb-2">
									<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
										{result.session.agent}
									</span>
									{result.session.sessionName && (
										<span class="text-sm text-zinc-200 truncate">
											{result.session.sessionName}
										</span>
									)}
									<span class="text-xs text-zinc-600 font-mono ml-auto flex-shrink-0">
										{(result.score * 100).toFixed(0)}%
									</span>
								</div>

								{/* First message or snippet preview */}
								<p class="text-sm text-zinc-300 mb-3 line-clamp-2">
									{result.session.firstMessage ??
										result.snippets[0]?.slice(0, 200) ??
										"No preview available"}
								</p>

								{/* Commit links */}
								{result.commits.length > 0 && (
									<div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-zinc-500">
										{result.commits.slice(0, 3).map((commit) => (
											<span class="flex items-center gap-1">
												<span class="text-blue-400 font-mono">
													{commit.sha.slice(0, 7)}
												</span>
												{commit.message && (
													<span class="text-zinc-500 truncate max-w-48">
														{commit.message}
													</span>
												)}
											</span>
										))}
										{result.commits.length > 3 && (
											<span class="text-zinc-600">
												+{result.commits.length - 3} more
											</span>
										)}
									</div>
								)}

								{/* Repo + time metadata */}
								<div class="flex items-center gap-2 mt-2 text-xs text-zinc-500">
									{firstCommit && (
										<span class="font-mono">
											{firstCommit.org}/{firstCommit.repo}
										</span>
									)}
									{firstCommit?.branch && (
										<>
											<span class="text-zinc-700">&middot;</span>
											<span class="font-mono">
												<i class="ph ph-git-branch text-[10px] mr-0.5" />
												{firstCommit.branch}
											</span>
										</>
									)}
									<span class="text-zinc-700">&middot;</span>
									<span>{relativeTime(result.session.createdAt)}</span>
								</div>
							</a>
						);
					})}
				</div>
			)}
		</Layout>,
	);
});

// Org page — list repos for an org
pages.get("/:org", async (c) => {
	const org = c.req.param("org");
	const { DL } = c.var;
	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const [reposResult, dailyCountsResult, contributorsResult] =
		await Promise.all([
			DL.orgs.getReposByOrg(org),
			DL.stats.getDailyActivityCountsByOrg({ org, since: oneYearAgo }),
			DL.stats.getContributors({ scope: "org", org }),
		]);
	const repos = reposResult.isOk ? reposResult.value : [];
	const dailyCounts = dailyCountsResult.isOk ? dailyCountsResult.value : [];
	const contributors = contributorsResult.isOk ? contributorsResult.value : [];
	const username = c.get("username");

	if (repos.length === 0) {
		return c.html(
			<Layout title={`${org} — residue`} username={username} breadcrumbs={[]}>
				<p class="text-zinc-400">No data found for this organization.</p>
			</Layout>,
			404,
		);
	}

	return c.html(
		<Layout
			title={`${org} — residue`}
			username={username}
			breadcrumbs={[{ label: org }]}
		>
			<ActivityGraph dailyCounts={dailyCounts} />

			<Contributors contributors={contributors} />

			<div class="flex flex-col gap-3">
				{repos.map((repo) => (
					<a
						href={`/app/${org}/${repo.repo}`}
						class="block bg-zinc-900 border border-zinc-800 rounded-md p-4 hover:border-zinc-700 transition-colors"
					>
						<div class="flex items-center justify-between">
							<span class="text-zinc-100 font-medium">{repo.repo}</span>
							<div class="flex items-center gap-3 text-zinc-400 text-sm">
								<span>
									{repo.session_count}{" "}
									{repo.session_count === 1 ? "session" : "sessions"}
								</span>
								<span>
									{repo.commit_count}{" "}
									{repo.commit_count === 1 ? "commit" : "commits"}
								</span>
							</div>
						</div>
						{repo.last_activity && (
							<span class="text-zinc-500 text-xs mt-1 block">
								{relativeTime(repo.last_activity)}
							</span>
						)}
					</a>
				))}
			</div>
		</Layout>,
	);
});

// Repo page — commit graph with session lanes
pages.get("/:org/:repo", async (c) => {
	const org = c.req.param("org");
	const repo = c.req.param("repo");
	const cursorParam = c.req.query("cursor");
	const prevParam = c.req.query("prev");
	const cursor = cursorParam ? Number(cursorParam) : undefined;
	const username = c.get("username");

	// Parse the prev stack: comma-separated list of previous cursors
	const prevStack = prevParam ? prevParam.split(",") : [];

	const commitLimit = 20;

	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const { DL } = c.var;
	const [rowsResult, dailyCountsResult, contributorsResult] = await Promise.all(
		[
			DL.commits.getGraphData({ org, repo, cursor, limit: commitLimit }),
			DL.stats.getDailyActivityCounts({ org, repo, since: oneYearAgo }),
			DL.stats.getContributors({ scope: "repo", org, repo }),
		],
	);
	const rows = rowsResult.isOk ? rowsResult.value : [];
	const dailyCounts = dailyCountsResult.isOk ? dailyCountsResult.value : [];
	const contributors = contributorsResult.isOk ? contributorsResult.value : [];

	if (rows.length === 0 && !cursorParam) {
		return c.html(
			<Layout
				title={`${org}/${repo} — residue`}
				username={username}
				breadcrumbs={[{ label: org, href: `/app/${org}` }]}
			>
				<p class="text-zinc-400">No data found for this repository.</p>
			</Layout>,
			404,
		);
	}

	const graphData = computeGraph(rows);
	const lastCommit = graphData.commits[graphData.commits.length - 1];
	const isOnFirstPage = !cursorParam;
	const hasMore = graphData.commits.length === commitLimit;
	const nextCursor =
		hasMore && lastCommit?.committedAt != null
			? String(lastCommit.committedAt)
			: null;

	// Build the "next" prev stack by appending the current cursor (or "0" for the first page)
	const nextPrevStack = [...prevStack, cursorParam ?? "0"];
	const nextPrevParam = nextPrevStack.join(",");

	// Build the "previous" URL by popping the last entry from prevStack
	let prevUrl: string | null = null;
	if (!isOnFirstPage && prevStack.length > 0) {
		const parentStack = prevStack.slice(0, -1);
		const parentCursor = prevStack[prevStack.length - 1];
		if (parentCursor === "0") {
			// Going back to first page (no cursor)
			prevUrl = `/app/${org}/${repo}`;
		} else {
			const params = new URLSearchParams({ cursor: parentCursor });
			if (parentStack.length > 0) {
				params.set("prev", parentStack.join(","));
			}
			prevUrl = `/app/${org}/${repo}?${params.toString()}`;
		}
	}

	return c.html(
		<Layout
			title={`${org}/${repo} — residue`}
			username={username}
			breadcrumbs={[{ label: org, href: `/app/${org}` }, { label: repo }]}
		>
			<ActivityGraph dailyCounts={dailyCounts} org={org} repo={repo} />

			<StatsChart dailyCounts={dailyCounts} />

			<Contributors contributors={contributors} />

			<CommitGraph data={graphData} org={org} repo={repo} />

			{(prevUrl || nextCursor) && (
				<div class="flex items-center justify-between py-4">
					{prevUrl ? (
						<a
							href={prevUrl}
							class="text-blue-500 hover:underline text-sm flex items-center gap-1"
						>
							<i class="ph ph-arrow-left text-xs" />
							Newer
						</a>
					) : (
						<span />
					)}
					{nextCursor ? (
						<a
							href={`/app/${org}/${repo}?cursor=${nextCursor}&prev=${nextPrevParam}`}
							class="text-blue-500 hover:underline text-sm flex items-center gap-1"
						>
							Older
							<i class="ph ph-arrow-right text-xs" />
						</a>
					) : (
						<span />
					)}
				</div>
			)}
		</Layout>,
	);
});

// Commit permalink — full conversations
pages.get("/:org/:repo/:sha", async (c) => {
	const org = c.req.param("org");
	const repo = c.req.param("repo");
	const sha = c.req.param("sha");
	const username = c.get("username");
	const { DL } = c.var;

	const detailResult = await DL.commits.getShaDetail({ sha, org, repo });
	const rows = detailResult.isOk ? detailResult.value : [];

	if (rows.length === 0) {
		return c.html(
			<Layout
				title="Not found — residue"
				username={username}
				breadcrumbs={[
					{ label: org, href: `/app/${org}` },
					{ label: repo, href: `/app/${org}/${repo}` },
				]}
			>
				<p class="text-zinc-400">Commit not found.</p>
			</Layout>,
			404,
		);
	}

	const first = rows[0];
	const filesResult = await DL.commits.getFiles(sha);
	const files = filesResult.isOk ? filesResult.value : [];

	// Deduplicate sessions
	const uniqueSessions = new Map<
		string,
		{
			id: string;
			agent: string;
			agent_version: string | null;
		}
	>();
	for (const row of rows) {
		if (!uniqueSessions.has(row.session_id)) {
			uniqueSessions.set(row.session_id, {
				id: row.session_id,
				agent: row.agent,
				agent_version: row.agent_version,
			});
		}
	}

	// Load and transform each session
	const sessionsData = await Promise.all(
		[...uniqueSessions.values()].map(async (session) => {
			// Fetch raw data from R2
			let messages: {
				role: string;
				content: string;
				model?: string;
				tool_calls?: { name: string; input: string; output: string }[];
			}[] = [];
			try {
				const r2Obj = await c.env.BUCKET.get(`sessions/${session.id}.json`);
				if (r2Obj) {
					const rawText = await r2Obj.text();
					const mapper = getMapper(session.agent);
					if (mapper) {
						messages = mapper(rawText);
					}
				}
			} catch {
				// If R2 or mapper fails, show empty conversation
			}

			// Find continuation
			let continuesFrom: ContinuationLink | undefined;
			let continuesIn: ContinuationLink | undefined;
			try {
				const commitsResult = await DL.sessions.getCommits(session.id);
				const sessionCommits = commitsResult.isOk ? commitsResult.value : [];
				const idx = sessionCommits.findIndex((sc) => sc.commit_sha === sha);
				if (idx > 0) {
					const prev = sessionCommits[idx - 1];
					continuesFrom = {
						sha: prev.commit_sha,
						url: `/app/${org}/${repo}/${prev.commit_sha}`,
					};
				}
				if (idx >= 0 && idx < sessionCommits.length - 1) {
					const next = sessionCommits[idx + 1];
					continuesIn = {
						sha: next.commit_sha,
						url: `/app/${org}/${repo}/${next.commit_sha}`,
					};
				}
			} catch {
				// If continuation lookup fails, skip it
			}

			// Extract stats from messages
			const messageCount = messages.length;
			const toolCallCount = messages.reduce(
				(sum, m) => sum + (m.tool_calls?.length ?? 0),
				0,
			);
			const models = [
				...new Set(
					messages.filter((m) => m.model).map((m) => m.model as string),
				),
			];

			return {
				...session,
				messages,
				continuesFrom,
				continuesIn,
				messageCount,
				toolCallCount,
				models,
			};
		}),
	);

	const totalMessages = sessionsData.reduce((s, d) => s + d.messageCount, 0);
	const totalToolCalls = sessionsData.reduce((s, d) => s + d.toolCallCount, 0);
	const allModels = [...new Set(sessionsData.flatMap((d) => d.models))];

	return c.html(
		<Layout
			title={`${sha.slice(0, 7)} — ${org}/${repo} — residue`}
			username={username}
			breadcrumbs={[
				{ label: org, href: `/app/${org}` },
				{ label: repo, href: `/app/${org}/${repo}` },
				{ label: sha.slice(0, 7) },
			]}
		>
			{/* Commit header */}
			<div class="bg-zinc-900 border border-zinc-800 rounded-md p-4 mb-6">
				<div class="flex items-center justify-between gap-2 mb-2">
					<span class="text-blue-500 font-mono text-sm truncate">
						{sha.slice(0, 12)}
						<span class="hidden sm:inline">{sha.slice(12)}</span>
					</span>
					<a
						href={urls.githubCommit({ org, repo, sha })}
						target="_blank"
						rel="noopener noreferrer"
						class="flex-shrink-0 text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1.5 text-sm"
						title="View on GitHub"
					>
						<i class="ph ph-github-logo text-base" />
						<span class="hidden sm:inline">View on GitHub</span>
					</a>
				</div>
				<p class="text-zinc-100 mb-3">{first.message}</p>
				<div class="flex items-center gap-2 mb-3 flex-wrap">
					{first.branch && (
						<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400 font-mono">
							<i class="ph ph-git-branch text-[10px] mr-0.5" />
							{first.branch}
						</span>
					)}
					<AgentBadges
						sessions={[...uniqueSessions.values()].map((s) => ({
							id: s.id,
							agent: s.agent,
						}))}
					/>
					{allModels.map((model) => (
						<span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">
							{model}
						</span>
					))}
				</div>
				<div class="flex items-center gap-x-1.5 text-xs text-zinc-400 flex-wrap">
					<span class="flex items-center gap-1">
						<i class="ph ph-user text-zinc-500" />
						{first.author}
					</span>
					{first.committed_at && (
						<>
							<span class="text-zinc-600">&middot;</span>
							<span class="flex items-center gap-1">
								<i class="ph ph-clock text-zinc-500" />
								{formatTimestamp(first.committed_at)}
							</span>
						</>
					)}
					<span class="text-zinc-600">&middot;</span>
					<span class="flex items-center gap-1">
						<i class="ph ph-chats-circle text-zinc-500" />
						<span class="text-zinc-200 font-medium">{sessionsData.length}</span>
						{sessionsData.length === 1 ? " session" : " sessions"}
					</span>
					<span class="text-zinc-600">&middot;</span>
					<span class="flex items-center gap-1">
						<i class="ph ph-chat-text text-zinc-500" />
						<span class="text-zinc-200 font-medium">{totalMessages}</span>
						{totalMessages === 1 ? " message" : " messages"}
					</span>
					<span class="text-zinc-600">&middot;</span>
					<span class="flex items-center gap-1">
						<i class="ph ph-wrench text-zinc-500" />
						<span class="text-zinc-200 font-medium">{totalToolCalls}</span>
						{totalToolCalls === 1 ? " tool call" : " tool calls"}
					</span>
				</div>
			</div>

			{/* Files changed */}
			{files.length > 0 && (
				<details class="mb-6 group">
					<summary class="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5 select-none">
						<i class="ph ph-caret-right text-xs transition-transform group-open:rotate-90" />
						<span>
							{files.length} {files.length === 1 ? "file" : "files"} changed
							<span class="text-emerald-500 ml-1.5">
								+{files.reduce((s, f) => s + f.lines_added, 0)}
							</span>
							<span class="text-red-400 ml-1">
								-{files.reduce((s, f) => s + f.lines_deleted, 0)}
							</span>
						</span>
					</summary>
					<div class="mt-2 bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
						{files.map((f) => (
							<div class="flex items-center justify-between px-3 py-1.5 text-xs font-mono border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/30">
								<div class="flex items-center gap-2 min-w-0">
									<span
										class={`flex-shrink-0 w-4 text-center ${
											f.change_type === "A"
												? "text-emerald-400"
												: f.change_type === "D"
													? "text-red-400"
													: f.change_type === "R"
														? "text-blue-400"
														: "text-zinc-400"
										}`}
									>
										{f.change_type}
									</span>
									<span class="text-zinc-300 truncate">{f.file_path}</span>
								</div>
								<div class="flex-shrink-0 ml-4 flex items-center gap-2">
									{f.lines_added > 0 && (
										<span class="text-emerald-500">+{f.lines_added}</span>
									)}
									{f.lines_deleted > 0 && (
										<span class="text-red-400">-{f.lines_deleted}</span>
									)}
								</div>
							</div>
						))}
					</div>
				</details>
			)}

			{/* Sessions - tabbed if multiple */}
			{sessionsData.length === 1 ? (
				<div id={`session-${sessionsData[0].id}`}>
					<div class="flex items-center gap-2 mb-3">
						<span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
							{sessionsData[0].agent}
						</span>
						{sessionsData[0].agent_version && (
							<span class="text-xs text-zinc-500">
								v{sessionsData[0].agent_version}
							</span>
						)}
						<a
							href={`#session-${sessionsData[0].id}`}
							class="text-xs text-zinc-600 font-mono hover:text-zinc-400 transition-colors"
						>
							{sessionsData[0].id.slice(0, 8)}
						</a>
					</div>
					{sessionsData[0].messages.length === 0 ? (
						<p class="text-zinc-500 text-sm">No conversation data available.</p>
					) : (
						<>
							<Conversation
								messages={sessionsData[0].messages}
								continuesFrom={sessionsData[0].continuesFrom}
								continuesIn={sessionsData[0].continuesIn}
							/>
							<Minimap
								sessions={[
									{
										id: sessionsData[0].id,
										messages: sessionsData[0].messages,
									},
								]}
							/>
						</>
					)}
				</div>
			) : (
				<div>
					{/* Tab bar */}
					<div class="flex border-b border-zinc-800 mb-6 pb-0 gap-0 overflow-x-auto">
						{sessionsData.map((session, i) => (
							<a
								href={`#session-${session.id}`}
								class={`session-tab px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
									i === 0
										? "border-blue-500 text-zinc-100"
										: "border-transparent text-zinc-500 hover:text-zinc-300"
								}`}
								data-tab-index={i}
								data-session-id={session.id}
								onclick={`
                  document.querySelectorAll('.session-tab').forEach(t => {
                    t.classList.remove('border-blue-500', 'text-zinc-100');
                    t.classList.add('border-transparent', 'text-zinc-500');
                  });
                  this.classList.remove('border-transparent', 'text-zinc-500');
                  this.classList.add('border-blue-500', 'text-zinc-100');
                  document.querySelectorAll('.session-panel').forEach(p => p.classList.add('hidden'));
                  document.getElementById('session-panel-' + this.dataset.tabIndex).classList.remove('hidden');
                `}
							>
								{session.agent}{" "}
								<span class="text-zinc-600">{session.id.slice(0, 8)}</span>
							</a>
						))}
					</div>

					{/* Tab panels */}
					{sessionsData.map((session, i) => (
						<div
							id={`session-panel-${i}`}
							class={`session-panel ${i !== 0 ? "hidden" : ""}`}
						>
							{session.messages.length === 0 ? (
								<p class="text-zinc-500 text-sm">
									No conversation data available.
								</p>
							) : (
								<Conversation
									messages={session.messages}
									continuesFrom={session.continuesFrom}
									continuesIn={session.continuesIn}
								/>
							)}
						</div>
					))}

					{/* Minimap for all sessions (switches with tabs) */}
					<Minimap
						sessions={sessionsData
							.filter((s) => s.messages.length > 0)
							.map((s) => ({ id: s.id, messages: s.messages }))}
					/>

					{/* Activate tab from URL hash */}
					{raw(`<script>
            (function() {
              var hash = location.hash;
              if (!hash || !hash.startsWith('#session-')) return;
              var sessionId = hash.slice(9);
              var tab = document.querySelector('.session-tab[data-session-id="' + sessionId + '"]');
              if (tab) tab.click();
            })();
          </script>`)}
				</div>
			)}
		</Layout>,
	);
});
export { pages };
