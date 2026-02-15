import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { ActivityGraph } from "../components/ActivityGraph";
import { CommitGraph } from "../components/CommitGraph";
import type { ContinuationLink } from "../components/Conversation";
import { Conversation } from "../components/Conversation";
import { Layout } from "../components/Layout";
import type { CommitWithSessionRow } from "../lib/db";
import { DB } from "../lib/db";
import { computeGraph } from "../lib/graph";
import { formatTimestamp, relativeTime } from "../lib/time";
import { getMapper } from "../mappers";

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

const pages = new Hono<{ Bindings: Env; Variables: { username: string } }>();

// Home page — list orgs
pages.get("/", async (c) => {
	const db = new DB(c.env.DB);
	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const [orgs, dailyCounts] = await Promise.all([
		db.getOrgList(),
		db.getDailyActivityCountsGlobal({ since: oneYearAgo }),
	]);
	const username = c.get("username");

	return c.html(
		<Layout title="residue" username={username}>
			<h1 class="text-2xl font-bold mb-6 text-zinc-100">residue</h1>

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
					<ActivityGraph dailyCounts={dailyCounts} />

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
				</>
			)}
		</Layout>,
	);
});

// Org page — list repos for an org
pages.get("/:org", async (c) => {
	const org = c.req.param("org");
	const db = new DB(c.env.DB);
	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const [repos, dailyCounts] = await Promise.all([
		db.getReposByOrg(org),
		db.getDailyActivityCountsByOrg({ org, since: oneYearAgo }),
	]);
	const username = c.get("username");

	if (repos.length === 0) {
		return c.html(
			<Layout
				title={`${org} — residue`}
				username={username}
				breadcrumbs={[{ label: "residue", href: "/app" }]}
			>
				<p class="text-zinc-400">No data found for this organization.</p>
			</Layout>,
			404,
		);
	}

	return c.html(
		<Layout
			title={`${org} — residue`}
			username={username}
			breadcrumbs={[{ label: "residue", href: "/app" }, { label: org }]}
		>
			<ActivityGraph dailyCounts={dailyCounts} />

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
	const cursor = cursorParam ? Number(cursorParam) : undefined;
	const username = c.get("username");

	const db = new DB(c.env.DB);
	const commitLimit = 20;

	const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
	const [rows, dailyCounts] = await Promise.all([
		db.getCommitGraphData({ org, repo, cursor, limit: commitLimit }),
		db.getDailyActivityCounts({ org, repo, since: oneYearAgo }),
	]);

	if (rows.length === 0 && !cursorParam) {
		return c.html(
			<Layout
				title={`${org}/${repo} — residue`}
				username={username}
				breadcrumbs={[
					{ label: "residue", href: "/app" },
					{ label: org, href: `/app/${org}` },
				]}
			>
				<p class="text-zinc-400">No data found for this repository.</p>
			</Layout>,
			404,
		);
	}

	const graphData = computeGraph(rows);
	const lastCommit = graphData.commits[graphData.commits.length - 1];
	const hasMore = graphData.commits.length === commitLimit;
	const nextCursor =
		hasMore && lastCommit?.committedAt != null
			? String(lastCommit.committedAt)
			: null;

	return c.html(
		<Layout
			title={`${org}/${repo} — residue`}
			username={username}
			breadcrumbs={[
				{ label: "residue", href: "/app" },
				{ label: org, href: `/app/${org}` },
				{ label: repo },
			]}
		>
			<ActivityGraph dailyCounts={dailyCounts} org={org} repo={repo} />

			<CommitGraph data={graphData} org={org} repo={repo} />

			{nextCursor && (
				<a
					href={`/app/${org}/${repo}?cursor=${nextCursor}`}
					class="block text-center text-blue-500 py-4 hover:underline text-sm"
				>
					Load more
				</a>
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

	const db = new DB(c.env.DB);
	const rows = await db.getCommitShaDetail({ sha, org, repo });

	if (rows.length === 0) {
		return c.html(
			<Layout
				title="Not found — residue"
				username={username}
				breadcrumbs={[
					{ label: "residue", href: "/app" },
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
				const sessionCommits = await db.getSessionCommits(session.id);
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
				{ label: "residue", href: "/app" },
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
						href={`https://github.com/${org}/${repo}/commit/${sha}`}
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
						<Conversation
							messages={sessionsData[0].messages}
							continuesFrom={sessionsData[0].continuesFrom}
							continuesIn={sessionsData[0].continuesIn}
						/>
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
