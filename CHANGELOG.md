# residue

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
