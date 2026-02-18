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

function renderSearchResults(results: SearchResponse): void {
	if (results.data.length === 0) {
		log.info("No results found.");
		return;
	}

	log.info(`${results.data.length} result(s) for "${results.search_query}"\n`);

	for (const item of results.data) {
		const sessionId = extractSessionId(item.filename);
		const scorePercent = (item.score * 100).toFixed(1);

		log.info(`  ${sessionId}  [${scorePercent}%]`);

		// Show the first content chunk as a snippet
		const snippet = item.content[0]?.text;
		if (snippet) {
			log.info(`    ${formatSnippet(snippet)}`);
		}

		log.info("");
	}
}

function renderAiSearchResults(results: AiSearchResponse): void {
	if (results.response) {
		log.info(results.response);
		log.info("");
	}

	if (results.data.length > 0) {
		log.info(`--- Sources (${results.data.length}) ---\n`);
		for (const item of results.data) {
			const sessionId = extractSessionId(item.filename);
			const scorePercent = (item.score * 100).toFixed(1);
			log.info(`  ${sessionId}  [${scorePercent}%]`);
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

		if (opts.isAi && isAiSearchResponse(results)) {
			renderAiSearchResults(results);
		} else {
			renderSearchResults(results);
		}

		return ok(undefined);
	});
}
