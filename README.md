# residue

An open-source CLI + self-hosted backend that captures AI agent conversations and links them to git commits. Every push uploads the conversations that informed your code changes, creating a searchable record of how code was written.

## How It Works

There are two event sources: **agent adapters** and **git hooks**.

Agent adapters call into the CLI when conversations start and end. Git hooks call into the CLI when commits and pushes happen. The CLI maintains local state that connects the two.

```
Agent Adapter                   Git Hooks
    |                               |
    |-- session-start --\           |
    |                    v          |
    |              LOCAL STATE      |
    |              (pending queue)  |
    |-- session-end ----/           |
    |                               |-- post-commit -> capture
    |                               |   (tag pending sessions with SHA)
    |                               |
    |                               |-- pre-push -> sync
    |                               |   (upload to worker, clear local state)
```

1. Adapter calls `residue session-start` when a conversation begins
2. User works with the AI agent, making code changes
3. Adapter calls `residue session-end` when the conversation ends
4. User commits -- `post-commit` hook tags all pending sessions with the commit SHA
5. User pushes -- `pre-push` hook uploads session data + commit mappings to the worker

A single conversation can span multiple commits. The full session is stored once and multiple commits reference it.

## Architecture

```
packages/
  cli/              -> "residue" npm package
  worker/           -> Cloudflare Worker (Hono + JSX)
  adapters/
    claude-code/    -> Claude Code adapter (hooks system)
    pi/             -> pi coding agent adapter
```

Monorepo managed with pnpm workspaces. Runtime is bun.

## Prerequisites

- [bun](https://bun.sh) -- runtime for the CLI and adapter scripts
- [pnpm](https://pnpm.io) -- monorepo package manager (for development)

## Setup

### 1. Deploy the worker

The worker is a Cloudflare Worker that stores session data in R2 and commit metadata in D1. Deploy your own instance:

```bash
cd packages/worker
pnpm install
bash setup.sh
```

The setup script creates D1 + R2 resources, generates an auth token, and deploys. See [`packages/worker/README.md`](packages/worker/README.md) for manual setup or configuration details.

### 2. Install the CLI

```bash
npm install -g residue
```

### 3. Login (requires worker URL from step 1)

```bash
residue login --url https://your-worker.workers.dev --token YOUR_TOKEN
```

### 4. Initialize a repo (requires login from step 3)

```bash
cd your-project
residue init
```

This installs `post-commit` and `pre-push` git hooks that call `residue capture` and `residue sync`.

### 5. Install an adapter

**Claude Code:**

The adapter uses Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks) to call `residue session start` and `residue session end` automatically when conversations begin and end. Requires steps 1-4 above.

Install from the monorepo root:

```bash
bun run packages/adapters/claude-code/install.ts
```

This adds `SessionStart` and `SessionEnd` hooks to `~/.claude/settings.json`. See [`packages/adapters/claude-code/README.md`](packages/adapters/claude-code/README.md) for manual setup or details on how session tracking works.

**Pi coding agent:**

```bash
pi install /path/to/packages/adapters/pi
```

The adapter hooks into pi's session lifecycle and calls the CLI automatically.

## CLI Commands

| Command | Description |
|---|---|
| `residue login` | Save worker URL + auth token to `~/.residue/config` |
| `residue init` | Install git hooks in current repo |
| `residue push` | Manually upload pending sessions |
| `residue capture` | Tag pending sessions with current commit SHA (called by post-commit hook) |
| `residue sync` | Upload sessions to worker (called by pre-push hook) |
| `residue session-start` | Register a new session (called by adapters) |
| `residue session-end` | Mark a session as ended (called by adapters) |

## Worker

The worker serves both a JSON API and a server-rendered UI.

**API routes:**

| Route | Description |
|---|---|
| `POST /api/sessions` | Upload session data + commit mappings |
| `GET /api/sessions/:id` | Fetch raw session data |
| `GET /api/repos/:org/:repo` | List commits with linked sessions |
| `GET /api/repos/:org/:repo/:sha` | Get sessions for a specific commit |

**UI routes** (served under `/app`):

| Route | Description |
|---|---|
| `/app` | List of orgs |
| `/app/:org` | List of repos in org |
| `/app/:org/:repo` | Commit timeline with linked sessions |
| `/app/:org/:repo/:sha` | Commit permalink with full conversation |

Org and repo are inferred from the git remote URL. No manual configuration needed.

## Development

```bash
# Install dependencies
pnpm install

# Start the worker dev server
pnpm run dev:worker

# Build the CLI
pnpm run build:cli

# Run tests
pnpm --filter residue test      # CLI tests
pnpm --filter worker test       # worker tests
```

## Design Decisions

- **No data normalization.** Raw agent session data is stored as-is in R2. The UI uses mappers to transform each agent's format into a common message format for rendering.
- **Self-hosted.** Each user/team deploys their own Cloudflare Worker. No multi-tenant backend, no auth complexity.
- **Single auth token.** Set at deploy time as an environment variable. No user management.
- **Never block git.** Hooks exit 0 even on errors. Session capture and sync are best-effort.

## License

MIT
