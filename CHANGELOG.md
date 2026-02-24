# residue

## 0.0.12

### @residue/cli

- Remove `residue search` command and AI search integration

### @residue/worker

- Remove AutoRAG search API routes and search UI from nav bar
- Remove AI binding from worker configuration
- Show message timestamps in conversation view

### @residue/docs

- Remove AI search references from README and docs site

### @residue/installer

- Remove AI Search provisioning step from deploy wizard

## 0.0.11

### @residue/worker

- Add API endpoints to manually link and unlink sessions from commits

## 0.0.10

### @residue/worker

- Remove `@residue/adapter` workspace dependency so the worker deploys standalone
- Copy mappers into `src/mappers/` with source references back to the adapter package

## 0.0.9

### @residue/cli

- Add `residue doctor` command to retroactively link orphaned sessions to commits
- Extract agent mappers, search extractors, and shared types into `@residue/adapter` package
- Send first/last message timestamps during sync for accurate session duration tracking

### @residue/worker

- Extract agent mappers, search extractors, and shared types into `@residue/adapter` package
- Add daily activity line chart to repo dashboard page
- Add time stats cards, hour-of-day chart, and day-of-week chart to all dashboard pages
- Track first/last message timestamps for accurate session duration instead of wall-clock time

## 0.0.8

### @residue/cli

- Add OpenCode agent support with plugin adapter and search text extractor
- Add process exit handler and idle data dump to the opencode plugin

### @residue/worker

- Add OpenCode agent support with session mapper
- Add IDE-style conversation minimap to the commit permalink page
- Style scrollbars across the UI to match the zinc dark theme

## 0.0.7

### @residue/cli

- Add `residue read <session-id>` command to pipe session transcript data to stdout from local state
- Add `residue context` command that outputs agent-facing documentation to stdout
- Add CLI-to-worker version mismatch detection via `X-Version` header and `/api/ping` endpoint
- Track files touched per commit with line counts during sync
- Surface commit file data (paths, change types, line counts) in query output and search text
- Derive deterministic session IDs from agent data path instead of random UUIDs
- Run post-commit hook synchronously to prevent git index.lock races

### @residue/worker

- Add search UI in nav bar with results page
- Revamp home page dashboard layout
- Add weekly activity bar chart to repo page
- Add SVG charting library for server-rendered data visualizations
- Surface commit file data (paths, change types, line counts) in commit detail UI
- Add CLI-to-worker version mismatch detection via `X-Version` header and `/api/ping` endpoint

### @residue/docs

- Split documentation into multi-page layout
- Simplify setup instructions to one-liners with links to detailed docs

## 0.0.6

### @residue/worker

- Display version number in the footer next to the GitHub icon

### @residue/docs

- Update setup guide with AI Search instructions, `--local` login flag, and corrected manual deploy steps

## 0.0.5

### @residue/cli

- Add `residue query` command for structured database lookups (sessions, commits) with filtering and `--json` output
- Enrich search results with session name, first message, and data file path
- Extract and send session metadata (data_path, first_message, session_name) during sync

### @residue/worker

- Store and serve session metadata (data_path, first_message, session_name) in D1
- Add query API endpoints for sessions and commits with filtering
- Add GitHub Actions workflow for updating deployed worker instances from upstream releases
- Add PR template and CONTRIBUTING.md

## 0.0.4

### @residue/cli

- Add `residue search <query>` command to search session history from the terminal
- Add `--ai` flag for AI-powered search that generates answers with citations
- Search results include clickable worker URLs to view full conversations
- Add `residue clear` command to remove stuck pending sessions from the local queue
- Generate lightweight search text at sync time, stripped of thinking blocks, tool output, and metadata noise
- Upload search text to R2 `search/` prefix for Cloudflare AI Search indexing

### @residue/worker

- Add `GET /api/search?q=` endpoint for vector search across session history
- Add `GET /api/search/ai?q=` endpoint for AI-powered search with generated answers
- Add `GET /api/sessions/:id/commits` endpoint to retrieve commits linked to a session
- Return dual presigned URLs (raw session + search text) from upload-url endpoint
- Centralize external URLs and add GitHub commit link to footer

### @residue/docs

- Add troubleshooting section for R2 credential errors

## 0.0.3

### @residue/cli

- Add `residue status` command to show login, hooks, adapters, and pending session state
- Read version from package.json instead of hardcoding
- Add repository field for npm provenance verification

### @residue/docs

- Clarify bun runtime requirement and improve mobile layout
- Add versioning policy and common workflows sections to AGENTS.md

## 0.0.2

### @residue/cli

- Add per-project login support with `--local` flag on `residue login`
- Local-first config resolution in sync command

## 0.0.1

### @residue/cli

- Initial release
- `residue login`, `residue init`, `residue setup`, `residue capture`, `residue sync`, `residue push`
- `residue session start/end` for agent adapters
- `residue hook claude-code` for Claude Code native hook protocol
- Claude Code and Pi agent adapters

### @residue/worker

- Initial release
- API routes for session upload, metadata, and retrieval
- Presigned R2 PUT URL generation for direct session data upload
- D1-backed session and commit metadata storage
- Server-rendered UI with Hono JSX
- Conversation rendering with code blocks, tool calls, and markdown
- Claude Code and Pi session mappers
- Dark and light mode support
- Basic auth for UI, bearer token auth for API

### @residue/docs

- Initial release
- Documentation site with Astro
