import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { resolveConfig } from "@/lib/config";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("search");

type SearchContentChunk = {
	type: string;
	text: string;
};

type SearchResultItem = {
	file_id: string;
	filename: string;
	score: number;
	attributes: Record<string, unknown>;
	content: SearchContentChunk[];
};

type SearchResponse = {
	object: string;
	search_query: string;
	data: SearchResultItem[];
	has_more: boolean;
	next_page: string | null;
};

type AiSearchResponse = SearchResponse & {
	response: string;
};

type SessionCommit = {
	commit_sha: string;
	committed_at: number | null;
	org: string;
	repo: string;
	branch: string | null;
};

function fetchSearch(opts: {
	workerUrl: string;
	token: string;
	query: string;
	isAi: boolean;
}): ResultAsync<SearchResponse | AiSearchResponse, CliError> {
	const path = opts.isAi ? "/api/search/ai" : "/api/search";
	const url = `${opts.workerUrl}${path}?q=${encodeURIComponent(opts.query)}`;

	return ResultAsync.fromPromise(
		fetch(url, {
			headers: { Authorization: `Bearer ${opts.token}` },
		}).then(async (response) => {
			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(`HTTP ${response.status}: ${body}`);
			}
			return response.json() as Promise<SearchResponse | AiSearchResponse>;
		}),
		toCliError({ message: "Search request failed", code: "NETWORK_ERROR" }),
	);
}

function fetchSessionCommits(opts: {
	workerUrl: string;
	token: string;
	sessionId: string;
}): ResultAsync<SessionCommit[], CliError> {
	const url = `${opts.workerUrl}/api/sessions/${opts.sessionId}/commits`;

	return ResultAsync.fromPromise(
		fetch(url, {
			headers: { Authorization: `Bearer ${opts.token}` },
		}).then(async (response) => {
			if (!response.ok) return [];
			const data = (await response.json()) as { commits: SessionCommit[] };
			return data.commits;
		}),
		toCliError({
			message: "Failed to fetch session commits",
			code: "NETWORK_ERROR",
		}),
	).orElse(() => ok([] as SessionCommit[]));
}

/**
 * Extract a session ID from an R2 filename like "sessions/<uuid>.json"
 * or "search/<uuid>.txt".
 */
function extractSessionId(filename: string): string {
	const match = filename.match(/(?:sessions|search)\/(.+?)\.(?:json|txt)$/);
	return match ? match[1] : filename;
}

/**
 * Truncate text to a max length, appending "..." if truncated.
 */
function truncate(opts: { text: string; maxLength: number }): string {
	if (opts.text.length <= opts.maxLength) return opts.text;
	return opts.text.slice(0, opts.maxLength) + "...";
}

/**
 * Clean up a content chunk for display: collapse whitespace,
 * strip JSON noise, and truncate.
 */
function formatSnippet(text: string): string {
	const cleaned = text
		.replace(/\\n/g, " ")
		.replace(/\\"/g, '"')
		.replace(/\s+/g, " ")
		.trim();
	return truncate({ text: cleaned, maxLength: 200 });
}

function buildCommitUrl(opts: {
	workerUrl: string;
	org: string;
	repo: string;
	sha: string;
}): string {
	return `${opts.workerUrl}/app/${opts.org}/${opts.repo}/${opts.sha}`;
}

function renderSearchResults(opts: {
	results: SearchResponse;
	commitMap: Map<string, SessionCommit[]>;
	workerUrl: string;
}): void {
	if (opts.results.data.length === 0) {
		log.info("No results found.");
		return;
	}

	log.info(
		`${opts.results.data.length} result(s) for "${opts.results.search_query}"\n`,
	);

	for (const item of opts.results.data) {
		const sessionId = extractSessionId(item.filename);
		const scorePercent = (item.score * 100).toFixed(1);

		log.info(`  ${sessionId}  [${scorePercent}%]`);

		const snippet = item.content[0]?.text;
		if (snippet) {
			log.info(`    ${formatSnippet(snippet)}`);
		}

		const commits = opts.commitMap.get(sessionId) ?? [];
		if (commits.length > 0) {
			for (const commit of commits) {
				const url = buildCommitUrl({
					workerUrl: opts.workerUrl,
					org: commit.org,
					repo: commit.repo,
					sha: commit.commit_sha,
				});
				log.info(`    -> ${url}`);
			}
		}

		log.info("");
	}
}

function renderAiSearchResults(opts: {
	results: AiSearchResponse;
	commitMap: Map<string, SessionCommit[]>;
	workerUrl: string;
}): void {
	if (opts.results.response) {
		log.info(opts.results.response);
		log.info("");
	}

	if (opts.results.data.length > 0) {
		log.info(`--- Sources (${opts.results.data.length}) ---\n`);
		for (const item of opts.results.data) {
			const sessionId = extractSessionId(item.filename);
			const scorePercent = (item.score * 100).toFixed(1);
			log.info(`  ${sessionId}  [${scorePercent}%]`);

			const commits = opts.commitMap.get(sessionId) ?? [];
			if (commits.length > 0) {
				for (const commit of commits) {
					const url = buildCommitUrl({
						workerUrl: opts.workerUrl,
						org: commit.org,
						repo: commit.repo,
						sha: commit.commit_sha,
					});
					log.info(`    -> ${url}`);
				}
			}
		}
		log.info("");
	}
}

function isAiSearchResponse(
	response: SearchResponse | AiSearchResponse,
): response is AiSearchResponse {
	return "response" in response;
}

export function search(opts: {
	query: string;
	isAi?: boolean;
}): ResultAsync<void, CliError> {
	return safeTry(async function* () {
		const config = yield* resolveConfig();
		if (!config) {
			return err(
				new CliError({
					message: "Not configured. Run 'residue login' first.",
					code: "CONFIG_MISSING",
				}),
			);
		}

		const results = yield* fetchSearch({
			workerUrl: config.worker_url,
			token: config.token,
			query: opts.query,
			isAi: opts.isAi ?? false,
		});

		// Fetch commits for each session in parallel
		const sessionIds = results.data.map((item) =>
			extractSessionId(item.filename),
		);
		const uniqueSessionIds = [...new Set(sessionIds)];

		const commitResults = yield* ResultAsync.combine(
			uniqueSessionIds.map((sessionId) =>
				fetchSessionCommits({
					workerUrl: config.worker_url,
					token: config.token,
					sessionId,
				}).map((commits) => ({ sessionId, commits })),
			),
		);

		const commitMap = new Map<string, SessionCommit[]>();
		for (const entry of commitResults) {
			commitMap.set(entry.sessionId, entry.commits);
		}

		if (opts.isAi && isAiSearchResponse(results)) {
			renderAiSearchResults({
				results,
				commitMap,
				workerUrl: config.worker_url,
			});
		} else {
			renderSearchResults({
				results,
				commitMap,
				workerUrl: config.worker_url,
			});
		}

		return ok(undefined);
	});
}
