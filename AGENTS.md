# residue

An open-source CLI + self-hosted backend that captures AI agent conversations and links them to git commits. Every push uploads the conversations that informed your code changes, creating a searchable record of how code was written.

## Architecture

Residue is a monorepo with five packages managed by pnpm workspaces, built with Bun runtime. The adapter package is the source-of-truth for agent-specific conversation mappers, search text extractors, and install-time templates. The CLI orchestrates session capture, git hook integration, and R2 uploads via presigned URLs. The worker (Cloudflare) serves both the API and UI, rendering conversations and providing search.

## How It Works

**Session Lifecycle:** Agent adapters call into the CLI when conversations start and end. Git hooks call into the CLI when commits and pushes happen. The CLI maintains local pending queue state that connects the two. When a user commits, pending sessions get tagged with the commit SHA. When they push, ended sessions are uploaded to R2 and D1, while open sessions are kept for the next push.

**Upload Flow:** Session data bypasses the worker entirely. The CLI requests presigned PUT URLs from the worker, then uploads raw session data and lightweight search text directly to R2. Only metadata (session ID, agent, commit mappings) goes to the worker's D1 database.

**Key Design Decisions:** A single session can span multiple commits. Capture tagging is selective: open sessions always get tagged, ended sessions with zero commits get tagged once, ended sessions that already have commits are skipped. Open sessions re-upload their current state on each push, overwriting the previous blob with the same R2 key. Stale open sessions (unmodified for 30+ minutes) are auto-closed during sync. Org and repo are inferred from git remote, no manual config needed. Raw agent session data is stored as-is; mappers normalize it at render time. Search uses lightweight text files instead of raw blobs, containing only human messages, assistant text, and tool names.

## Packages

**Adapter (`packages/adapter`):** Source-of-truth for agent-specific code. Contains conversation mappers, search text extractors, shared types, and install-time templates. See `packages/adapter/AGENTS.md`.

**CLI (`packages/cli`):** Orchestrates session lifecycle, git hooks, and R2 uploads. Maintains local pending queue state in `.residue/pending.json`. Handles agent adapter integration (Claude Code hooks, Pi extensions, OpenCode plugins). See `packages/cli/AGENTS.md`.

**Worker (`packages/worker`):** Cloudflare Worker serving both API and UI. Generates presigned R2 URLs for CLI uploads. Stores session metadata and commit mappings in D1. Renders conversations via agent-specific mappers. Provides vector and AI-powered search. See `packages/worker/AGENTS.md`.

**Installer (`packages/installer`):** One-click deploy wizard for provisioning a user's own worker on Cloudflare. See `packages/installer/AGENTS.md`.

**Docs (`packages/docs`):** Public documentation site. See `packages/docs/AGENTS.md`.

## Development

Start dev server via tmux: `tmuxinator local` from project root. Read output with `tmux capture-pane -t residue -p`.

## Code Exploration

Use dora for code intelligence: `dora --help` for all commands, or `dora cookbook show quickstart --format markdown` for query patterns.

## Versioning

All packages share the same version. Update `version` in every `package.json` (root, cli, worker, adapter) to the same value when bumping.

## bd - Dependency-Aware Issue Tracker

Dependency-aware issue tracker. Auto-syncs with git via JSONL. Create issues when discovering new work, use `bd ready` to find unblocked work to claim. Run `bd --help` for all commands, or `bd prime` for a full overview.
