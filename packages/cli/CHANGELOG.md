# @residue/cli

## 0.0.9

### Patch Changes

- f31ce64: Add `residue doctor` command to retroactively link orphaned sessions to commits.
- f31ce64: Extract agent mappers, search extractors, and shared types into `@residue/adapter` package.
- f31ce64: Add time stats dashboard with hour-of-day, day-of-week charts and duration cards. Track first/last message timestamps for accurate session duration instead of wall-clock time.

## 0.0.8

### Patch Changes

- f33521c: Add OpenCode agent support with plugin adapter, session mapper, and search text extractor.
- f33521c: Add process exit handler and idle data dump to the opencode plugin to prevent data loss.

## 0.0.7

### Patch Changes

- 984d53a: Add `residue context` command that outputs agent-facing documentation to stdout.
- d5c7297: Add `residue read <session-id>` command to pipe session transcript data to stdout from local state.
- 6a7123e: Run post-commit hook synchronously to prevent git index.lock races with subsequent commands.
- bc7f309: Add CLI-to-worker version mismatch detection via `X-Version` response header and `/api/ping` endpoint.

## 0.0.6

## 0.0.5

### Patch Changes

- 1403e90: Add `residue query` command for structured database lookups (sessions, commits) with filtering and `--json` output.
- 1403e90: Enrich search results with session name, first message, and data file path.
- 1403e90: Add session metadata extractors (first message, session name, data path) to search text headers.
- 1403e90: Extract and send session metadata (data_path, first_message, session_name) to the worker during sync.

## 0.0.4

### Patch Changes

- ca5ad11: Add `residue clear` command to remove stuck pending sessions from the local queue. Clears all sessions by default, or a specific one with `--id`.
- ca5ad11: Add `residue search <query>` command to search session history from the terminal, with `--ai` flag for AI-powered answers. Results include clickable worker URLs to view full conversations.
- ca5ad11: Generate lightweight search text files at sync time and upload to R2 `search/` prefix for Cloudflare AI Search indexing. Add `/api/search` and `/api/search/ai` endpoints.

## 0.0.3

### Patch Changes

- Add status command, common workflows docs, versioning policy.

## 0.0.2

### Patch Changes

- Add per-project login support with `--local` flag. Running `residue login --local` saves config to `.residue/config` in the project root instead of the global `~/.residue/config`. The sync command now resolves config locally first before falling back to global.

## 0.0.1

### Features

- Initial release
- `residue login` to save worker URL and auth token
- `residue init` to install git hooks (post-commit, pre-push)
- `residue setup` for agent adapters (claude-code, pi)
- `residue capture` for post-commit session tagging
- `residue sync` for pre-push session upload via presigned R2 URLs
- `residue push` as manual sync alias
- `residue session start` and `residue session end` for agent adapters
- `residue hook claude-code` for Claude Code native hook protocol
- Claude Code and Pi agent adapters
