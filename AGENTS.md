# residue

**https://residue.dev**

An open-source CLI + self-hosted backend that captures AI agent conversations and links them to git commits. Every push uploads the conversations that informed your code changes, creating a searchable record of how code was written.

## Architecture

```
packages/
  cli/                → "residue" npm package, built with bun
  worker/             → Cloudflare Worker (Hono + JSX), one-click deploy template
  adapters/
    claude-code/      → Claude Code agent plugin
```

Monorepo managed with **pnpm workspaces**. Runtime is **bun**.

## How It Works

### Core Flow

There are two event sources: **agent plugins** and **git hooks**.

Agent plugins call into the CLI when conversations start and end. Git hooks call into the CLI when commits and pushes happen. The CLI maintains local state that connects the two.

```
Agent Plugin                    Git Hooks
    │                               │
    ├─ session-start ──┐            │
    │                  ▼            │
    │              LOCAL STATE      │
    │              (pending queue)  │
    ├─ session-end ────┘            │
    │                               ├─ post-commit → capture
    │                               │   (tag pending sessions with SHA)
    │                               │
    │                               ├─ pre-push → sync
    │                               │   (upload to worker, clear local state)
```

### Session Lifecycle

1. Agent plugin calls `residue session-start` → CLI generates a session ID, adds entry to pending queue
2. User has a conversation with the AI agent
3. Agent plugin calls `residue session-end` → CLI saves the raw session data, marks session as ended
4. User commits → post-commit hook runs `residue capture` → all pending sessions (ended AND open) get tagged with the commit SHA
5. User pushes → pre-push hook runs `residue sync` → uploads session data + commit mappings to the worker, clears local state

### Key Design Decisions

**A conversation can span multiple commits.** If a session is still open when a commit happens, it gets linked to that commit. When the next commit happens, the same session gets linked again. The full session data is stored once; multiple commits reference it.

**On push, open sessions upload their current state.** If a session is still open at push time, the current conversation state is uploaded to R2. On the next push, it gets overwritten with the latest state. The R2 key stays the same.

**Org and repo are inferred from the git remote.** `git@github.com:my-team/my-app.git` → org is `my-team`, repo is `my-app`. No manual configuration needed.

**No data normalization.** Raw agent session data is stored as-is in R2. The UI knows how to render each agent's format. Adding a new agent means writing a new renderer, not changing the storage schema.

**Users deploy their own worker.** No multi-tenant backend. Each user/team deploys their own Cloudflare Worker via a one-click deploy button. This eliminates auth complexity, data privacy concerns, and hosting costs for us.

## CLI (`packages/cli`)

### Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Published as:** `residue` on npm

### Commands

**User-facing:**

| Command         | Description                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------- |
| `residue login` | Save worker URL + auth token to global config                                                |
| `residue init`  | Install git hooks in current repo, detect available adapters. Warns if no adapters are found |
| `residue push`  | Manual trigger to upload pending sessions (alias for sync)                                   |

**Hook-invoked (git):**

| Command           | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `residue capture` | Called by post-commit hook. Tags all pending sessions with the current commit SHA            |
| `residue sync`    | Called by pre-push hook. Uploads all unsynced session data to the worker, clears local state |

**Hook-invoked (agent plugins):**

| Command                 | Description                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `residue session-start` | Called by agent plugin when a conversation begins. Generates and returns a session ID to stdout. Flags: `--agent <n>` `--version <semver>` `--data <path-to-raw-session-file>` |
| `residue session-end`   | Called by agent plugin when a conversation ends. Just marks the session as ended. Flags: `--id <session-id>`                                                                   |

### Local State

**Global config:** `~/.residue/config`

```json
{
  "worker_url": "https://my-residue.workers.dev",
  "token": "secret-token-from-deploy"
}
```

**Repo-level state:** `.git/ai-sessions/`

Pending queue: `.git/ai-sessions/pending.json`

```json
[
  {
    "id": "session-uuid-1",
    "agent": "claude-code",
    "agent_version": "1.2.3",
    "status": "ended",
    "data_path": "/path/to/raw/session/log",
    "commits": []
  },
  {
    "id": "session-uuid-2",
    "agent": "claude-code",
    "agent_version": "1.2.3",
    "status": "open",
    "data_path": "/path/to/raw/session/log",
    "commits": ["abc123"]
  }
]
```

**`residue capture` behavior:**

- Reads pending.json
- For every session (both `open` and `ended`), appends the current commit SHA to its `commits` array
- Writes updated pending.json

**`residue sync` behavior:**

- Reads pending.json
- Parses git remote to extract org + repo
- For each session:
  - Reads raw session data directly from `data_path` (no local copies)
  - Reads commit metadata (message, author, timestamp) from git log for each associated SHA
  - POSTs to worker: session metadata + raw data + commit SHAs with metadata
  - If session is `ended`: removes from pending.json
  - If session is `open`: keeps in pending.json (will re-upload with updated data on next push)

### Git Hooks

Installed by `residue init` into `.git/hooks/`:

**post-commit:**

```bash
#!/bin/sh
residue capture
```

**pre-push:**

```bash
#!/bin/sh
residue sync
```

## Worker (`packages/worker`)

### Tech Stack

- **Framework:** Hono
- **Rendering:** JSX (server-rendered HTML)
- **Build:** Vite
- **Styling:** Tailwind CSS
- **Icons:** Phosphor Icons
- **Storage:** Cloudflare R2 (raw session blobs) + D1 (query index)
- **Deployment:** One-click "Deploy to Cloudflare" button

The worker serves both the API (JSON) and the UI (HTML) from the same routes or parallel route groups.

### Auth

A single secret token set at deploy time as an environment variable. The CLI sends it as a Bearer token. No user management, no OAuth. It's their own infrastructure.

### D1 Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  agent_version TEXT,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  r2_key TEXT NOT NULL
);

CREATE TABLE commits (
  commit_sha TEXT NOT NULL,
  repo TEXT NOT NULL,
  org TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message TEXT,
  author TEXT,
  committed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE UNIQUE INDEX idx_commits_unique ON commits(commit_sha, session_id);
CREATE INDEX idx_commits_repo ON commits(org, repo);
CREATE INDEX idx_commits_sha ON commits(commit_sha);
CREATE INDEX idx_commits_session ON commits(session_id);
```

A session is stored once. Multiple commits can reference the same session. Org and repo live on the commits table since they come from the git remote.

### R2 Storage

Key format: `sessions/<session-id>.json`

The blob is the raw, unmodified agent session data. The worker does not parse, validate, or transform it. For open sessions that span multiple pushes, the key stays the same and the blob is overwritten with the latest state.

### API Routes

```
POST   /api/sessions                → Upload session data + commit mappings
GET    /api/sessions/:id            → Fetch raw session data from R2
GET    /api/repos/:org/:repo        → List commits with sessions (from D1, paginated via ?cursor=)
GET    /api/repos/:org/:repo/:sha   → Get sessions for a specific commit
```

**POST /api/sessions** request body:

```json
{
  "session": {
    "id": "session-uuid-1",
    "agent": "claude-code",
    "agent_version": "1.2.3",
    "status": "ended",
    "data": "<raw session content>"
  },
  "commits": [
    {
      "sha": "abc123",
      "org": "my-team",
      "repo": "my-app",
      "message": "fix auth redirect",
      "author": "jane",
      "committed_at": 1700000000
    },
    {
      "sha": "def456",
      "org": "my-team",
      "repo": "my-app",
      "message": "add rate limiting",
      "author": "jane",
      "committed_at": 1700003600
    }
  ]
}
```

Worker behavior on POST:

1. Write raw session data to R2 at `sessions/<session-id>.json`
2. Upsert session row in D1 (update `ended_at` if status is ended)
3. Insert commit rows in D1 (skip duplicates)

### Styling

**Fonts:** Monospace-first. `JetBrains Mono` or `IBM Plex Mono` for all UI text. System monospace as fallback.

**Color palette (dark mode — default):**

- Background: `zinc-950`
- Surface/cards: `zinc-900`
- Borders: `zinc-800`
- Primary text: `zinc-100`
- Secondary text: `zinc-400`
- Accent: `blue-500`
- Role labels: `emerald-400` (human), `violet-400` (assistant), `amber-400` (tool)

**Color palette (light mode):**

- Background: `zinc-50`
- Surface/cards: `white`
- Borders: `zinc-200`
- Primary text: `zinc-900`
- Secondary text: `zinc-500`
- Accent: `blue-600`
- Role labels: `emerald-600` (human), `violet-600` (assistant), `amber-600` (tool)

**Spacing:** Tight. `gap-2` between messages, `gap-4` between commits. Dense information display — this is a dev tool, not a marketing site.

**Code blocks:** Syntax highlighted with a minimal theme. Background slightly darker than surface. Rounded corners, small padding.

**Tool calls:** Collapsed by default. Phosphor `CaretRight` icon to expand. When expanded, show tool name, input, and output in a subdued style — they're context, not the main content.

**Commit entries:** Subtle left border or dot indicator. SHA in monospace accent color. Message in primary text. Author and timestamp in secondary text. Agent badges as small pills.

**Session continuation:** Thin connecting line between commits that share a session. "continues from/in" links in secondary text with Phosphor `ArrowUp`/`ArrowDown` icons.

**Responsive:** Single column. Works on mobile but optimized for desktop. No sidebar on mobile.

### UI Routes (Hono + JSX)

```
GET    /                            → List orgs (grouped from commits table)
GET    /:org                        → List repos in org
GET    /:org/:repo                  → Commit log with linked sessions
GET    /:org/:repo/:sha             → Expanded view: commit + conversation(s)
```

The UI is server-rendered HTML via Hono's JSX support. No client-side framework.

### UI Design

**Four pages:**

**`/` — Home:** List of orgs with repo counts.

**`/:org` — Org:** List of repos with last activity and session counts.

**`/:org/:repo` — Commit log (primary view):** Vertical timeline of commits, newest first. Each entry shows short SHA, commit message, author, relative timestamp, and agent badge(s). Clicking a commit expands the conversation(s) inline. If a session spans multiple commits, show "continues from <sha>" / "continues in <sha>" links for navigation.

**`/:org/:repo/:sha` — Permalink:** Same as expanded state but as its own page. Shareable URL.

**Overall feel:** Minimal. Dark and light mode. Monospace-leaning like GitHub. No dashboards, no charts. It's a reading interface.

### Conversation Rendering

There is **one generic UI component** that renders all conversations. It takes a common `Message[]` format and renders:

- Chat messages with role labels
- Code blocks with syntax highlighting
- Tool calls as collapsible blocks (tool name as header, input/output inside)
- Markdown rendering in message content
- "Continues from / continues in" links for sessions spanning multiple commits

Each agent gets a **mapper** — a pure function that transforms the agent's raw session data into the common format. The mapper is the only agent-specific code. Everything else is shared.

```ts
type ToolCall = {
  name: string;
  input: string;
  output: string;
};

type Message = {
  role: string;
  content: string;
  timestamp?: string;
  tool_calls?: ToolCall[];
};

type Mapper = (raw: string) => Message[];
```

Mappers live in the worker:

```
worker/
  mappers/
    claude-code.ts
    cursor.ts
    aider.ts
```

The worker reads `agent` + `agent_version` from D1, picks the right mapper, transforms the raw R2 blob, and passes `Message[]` to the JSX template. Adding a new agent means writing one mapper function.

### Deployment Template

The worker repo includes a "Deploy to Cloudflare" button that:

1. Forks/clones the worker package
2. Creates a D1 database and runs the migration
3. Creates an R2 bucket
4. Generates a secret token and sets it as an env var
5. Deploys the worker

The user gets back a worker URL and a token. That's all they need to run `residue login`.

## Adapters (`packages/adapters/`)

Each adapter is an agent-specific plugin that hooks into the agent's lifecycle and calls two CLI commands:

```
residue session-start --agent <name> --version <semver>
# returns session ID to stdout

residue session-end --id <session-id> --data <path-to-raw-log>
```

### Claude Code Adapter (`packages/adapters/claude-code/`)

The first adapter to build. Implementation depends on how Claude Code exposes session lifecycle hooks. The adapter needs to:

1. Detect when a new conversation starts
2. Locate the raw session log file path
3. Call `residue session-start --agent claude-code --version <detected-version> --data <path-to-log>`
4. Hold the returned session ID
5. Detect when the conversation ends
6. Call `residue session-end --id <session-id>`

Session data is stored in `~/.claude/projects/` — the adapter should read from there.

Future adapters (Cursor, Aider, Copilot, etc.) follow the same pattern with agent-specific lifecycle detection.

## Build & Development

```bash
# Install dependencies
pnpm install

# Dev
pnpm --filter cli dev
pnpm --filter worker dev    # wrangler dev

# Build
pnpm --filter cli build
pnpm --filter worker build

# Deploy worker
pnpm --filter worker deploy
```

## How to use TODO.json

1. When user asks to make changes to the code of plan features, look up the features in the TODO.json file before exploring further to get better context.
2. Whenever adding a new TODO, you must do a full scan and make sure all dependencies are also updated accordingly.
3. The `tests` are simple english instructions like `[repo]/test/[util].test.ts passes' to verify that the implementaiton worked.
4. `isDone` should be marked when tests are passing.
5. After doing a feature, you must use the `/commit-helper` skill to make a succinct and concise commit

```ts
type Todo = {
  id: number;
  title: string;
  description: string;
  tags: string[];
  isDone: boolean;
  tests: string[];
  dependencies: number[]; // ids of other TODOs
};
```
