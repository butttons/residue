# @residue/worker

## 0.0.9

### Patch Changes

- f31ce64: Add daily activity line chart to the repo dashboard page.
- f31ce64: Extract agent mappers, search extractors, and shared types into `@residue/adapter` package.
- f31ce64: Add time stats dashboard with hour-of-day, day-of-week charts and duration cards. Track first/last message timestamps for accurate session duration instead of wall-clock time.

## 0.0.8

### Patch Changes

- f33521c: Add OpenCode agent support with plugin adapter, session mapper, and search text extractor.
- 195a5d7: Add IDE-style conversation minimap to the commit permalink page for navigating long sessions.
- 195a5d7: Style scrollbars across the UI to match the zinc dark theme with thin 6px tracks.

## 0.0.7

### Patch Changes

- bc7f309: Add CLI-to-worker version mismatch detection via `X-Version` response header and `/api/ping` endpoint.

## 0.0.6

### Patch Changes

- 07f8138: Display version number in the footer next to the GitHub icon.

## 0.0.5

### Patch Changes

- 1403e90: Add `residue query` command for structured database lookups (sessions, commits) with filtering and `--json` output.
- 1403e90: Store and serve session metadata (data_path, first_message, session_name) in D1.
- 1403e90: Add GitHub Actions workflow for updating deployed worker instances from upstream releases.

## 0.0.4

### Patch Changes

- ca5ad11: Add `residue search <query>` command to search session history from the terminal, with `--ai` flag for AI-powered answers. Results include clickable worker URLs to view full conversations.
- ca5ad11: Generate lightweight search text files at sync time and upload to R2 `search/` prefix for Cloudflare AI Search indexing. Add `/api/search` and `/api/search/ai` endpoints.

## 0.0.2

### Patch Changes

- Add status command, common workflows docs, versioning policy.

## 0.0.1

### Features

- Initial release
- API routes for session upload, metadata, and retrieval
- Presigned R2 PUT URL generation for direct session data upload
- D1-backed session and commit metadata storage
- Server-rendered UI with Hono JSX
- Conversation rendering with code blocks, tool calls, and markdown
- Claude Code and Pi session mappers
- Dark and light mode support
- Basic auth for UI, bearer token auth for API
