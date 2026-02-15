# residue

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
