import { err, ok, ResultAsync, safeTry } from "neverthrow";
import { resolveConfig } from "@/lib/config";
import { residueFetch } from "@/lib/fetch";
import { CliError, toCliError } from "@/utils/errors";
import { createLogger } from "@/utils/logger";

const log = createLogger("query");

type QuerySessionItem = {
	id: string;
	agent: string;
	agent_version: string | null;
	created_at: number;
	ended_at: number | null;
	data_path: string | null;
	first_message: string | null;
	session_name: string | null;
};

type QueryCommitItem = {
	sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	org: string;
	repo: string;
	session_ids: string[];
};

type SessionDetail = {
	session: QuerySessionItem;
	commits: {
		commit_sha: string;
		message: string | null;
		author: string | null;
		committed_at: number | null;
		branch: string | null;
		org: string;
		repo: string;
	}[];
};

type CommitFileItem = {
	file_path: string;
	change_type: string;
	lines_added: number;
	lines_deleted: number;
};

type CommitDetail = {
	commit_sha: string;
	message: string | null;
	author: string | null;
	committed_at: number | null;
	branch: string | null;
	org: string;
	repo: string;
	sessions: QuerySessionItem[];
	files: CommitFileItem[];
};

function fetchJson<T>(opts: {
	url: string;
	token: string;
}): ResultAsync<T, CliError> {
	return ResultAsync.fromPromise(
		residueFetch(opts.url, {
			headers: { Authorization: `Bearer ${opts.token}` },
		}).then(async (response) => {
			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new CliError({
					message: `HTTP ${response.status}: ${body}`,
					code: "NETWORK_ERROR",
				});
			}
			return response.json() as Promise<T>;
		}),
		toCliError({ message: "Query request failed", code: "NETWORK_ERROR" }),
	);
}

function buildQueryString(params: Record<string, string | undefined>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			parts.push(`${key}=${encodeURIComponent(value)}`);
		}
	}
	return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function formatTimestamp(unix: number | null): string {
	if (unix === null) return "-";
	return new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function truncate(opts: { text: string; maxLength: number }): string {
	if (opts.text.length <= opts.maxLength) return opts.text;
	return opts.text.slice(0, opts.maxLength) + "...";
}

// --- Sessions list ---

function renderSessions(sessions: QuerySessionItem[]): void {
	if (sessions.length === 0) {
		log.info("No sessions found.");
		return;
	}

	log.info(`${sessions.length} session(s)\n`);
	for (const s of sessions) {
		log.info(`  ${s.id}`);
		log.info(`    agent: ${s.agent} ${s.agent_version ?? ""}`);
		if (s.session_name) log.info(`    name: ${s.session_name}`);
		if (s.first_message) {
			log.info(
				`    first: ${truncate({ text: s.first_message, maxLength: 120 })}`,
			);
		}
		if (s.data_path) log.info(`    file: ${s.data_path}`);
		log.info(`    created: ${formatTimestamp(s.created_at)}`);
		if (s.ended_at) log.info(`    ended: ${formatTimestamp(s.ended_at)}`);
		log.info("");
	}
}

// --- Commits list ---

function renderCommits(commits: QueryCommitItem[]): void {
	if (commits.length === 0) {
		log.info("No commits found.");
		return;
	}

	log.info(`${commits.length} commit(s)\n`);
	for (const c of commits) {
		const msg = c.message
			? truncate({ text: c.message, maxLength: 80 })
			: "(no message)";
		log.info(`  ${c.sha.slice(0, 7)} ${msg}`);
		log.info(`    repo: ${c.org}/${c.repo}`);
		if (c.branch) log.info(`    branch: ${c.branch}`);
		if (c.author) log.info(`    author: ${c.author}`);
		log.info(`    date: ${formatTimestamp(c.committed_at)}`);
		log.info(`    sessions: ${c.session_ids.join(", ")}`);
		log.info("");
	}
}

// --- Session detail ---

function renderSessionDetail(detail: SessionDetail): void {
	const s = detail.session;
	log.info(`Session ${s.id}\n`);
	log.info(`  agent: ${s.agent} ${s.agent_version ?? ""}`);
	if (s.session_name) log.info(`  name: ${s.session_name}`);
	if (s.first_message) {
		log.info(`  first: ${truncate({ text: s.first_message, maxLength: 120 })}`);
	}
	if (s.data_path) log.info(`  file: ${s.data_path}`);
	log.info(`  created: ${formatTimestamp(s.created_at)}`);
	if (s.ended_at) log.info(`  ended: ${formatTimestamp(s.ended_at)}`);

	if (detail.commits.length > 0) {
		log.info(`\n  ${detail.commits.length} commit(s):`);
		for (const c of detail.commits) {
			const msg = c.message
				? truncate({ text: c.message, maxLength: 60 })
				: "(no message)";
			log.info(
				`    ${c.commit_sha.slice(0, 7)} ${msg}  (${c.org}/${c.repo}${c.branch ? ` @ ${c.branch}` : ""})`,
			);
		}
	} else {
		log.info("\n  No commits linked.");
	}
	log.info("");
}

// --- Commit detail ---

function renderCommitDetail(detail: CommitDetail): void {
	const msg = detail.message ?? "(no message)";
	log.info(`Commit ${detail.commit_sha.slice(0, 7)}\n`);
	log.info(`  message: ${msg}`);
	log.info(`  repo: ${detail.org}/${detail.repo}`);
	if (detail.branch) log.info(`  branch: ${detail.branch}`);
	if (detail.author) log.info(`  author: ${detail.author}`);
	log.info(`  date: ${formatTimestamp(detail.committed_at)}`);

	if (detail.files && detail.files.length > 0) {
		const totalAdded = detail.files.reduce((s, f) => s + f.lines_added, 0);
		const totalDeleted = detail.files.reduce((s, f) => s + f.lines_deleted, 0);
		log.info(
			`\n  ${detail.files.length} file(s) changed (+${totalAdded} -${totalDeleted}):`,
		);
		for (const f of detail.files) {
			const stats = `+${f.lines_added} -${f.lines_deleted}`;
			log.info(`    ${f.change_type}  ${f.file_path}  ${stats}`);
		}
	}

	if (detail.sessions.length > 0) {
		log.info(`\n  ${detail.sessions.length} session(s):`);
		for (const s of detail.sessions) {
			log.info(`    ${s.id}  (${s.agent} ${s.agent_version ?? ""})`);
			if (s.session_name) log.info(`      name: ${s.session_name}`);
			if (s.data_path) log.info(`      file: ${s.data_path}`);
		}
	} else {
		log.info("\n  No sessions linked.");
	}
	log.info("");
}

// --- Public command functions ---

export function querySessions(opts: {
	agent?: string;
	repo?: string;
	branch?: string;
	since?: string;
	until?: string;
	isJson?: boolean;
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

		const qs = buildQueryString({
			agent: opts.agent,
			repo: opts.repo,
			branch: opts.branch,
			since: opts.since,
			until: opts.until,
		});

		const result = yield* fetchJson<{ sessions: QuerySessionItem[] }>({
			url: `${config.worker_url}/api/query/sessions${qs}`,
			token: config.token,
		});

		if (opts.isJson) {
			process.stdout.write(JSON.stringify(result.sessions, null, 2) + "\n");
		} else {
			renderSessions(result.sessions);
		}

		return ok(undefined);
	});
}

export function queryCommits(opts: {
	repo?: string;
	branch?: string;
	author?: string;
	since?: string;
	until?: string;
	isJson?: boolean;
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

		const qs = buildQueryString({
			repo: opts.repo,
			branch: opts.branch,
			author: opts.author,
			since: opts.since,
			until: opts.until,
		});

		const result = yield* fetchJson<{ commits: QueryCommitItem[] }>({
			url: `${config.worker_url}/api/query/commits${qs}`,
			token: config.token,
		});

		if (opts.isJson) {
			process.stdout.write(JSON.stringify(result.commits, null, 2) + "\n");
		} else {
			renderCommits(result.commits);
		}

		return ok(undefined);
	});
}

export function querySession(opts: {
	id: string;
	isJson?: boolean;
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

		const result = yield* fetchJson<SessionDetail>({
			url: `${config.worker_url}/api/query/sessions/${encodeURIComponent(opts.id)}`,
			token: config.token,
		});

		if (opts.isJson) {
			process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		} else {
			renderSessionDetail(result);
		}

		return ok(undefined);
	});
}

export function queryCommit(opts: {
	sha: string;
	isJson?: boolean;
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

		const result = yield* fetchJson<CommitDetail>({
			url: `${config.worker_url}/api/query/commits/${encodeURIComponent(opts.sha)}`,
			token: config.token,
		});

		if (opts.isJson) {
			process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		} else {
			renderCommitDetail(result);
		}

		return ok(undefined);
	});
}
