# residue

**https://residue.dev**

An open-source CLI + self-hosted backend that captures AI agent conversations and links them to git commits. Every push uploads the conversations that informed your code changes, creating a searchable record of how code was written.

## Architecture

```
packages/
  cli/                → "@residue/cli" npm package, built with bun
    adapters/
      pi/             → pi coding agent extension (embedded at build time)
  worker/             → Cloudflare Worker (Hono + JSX), one-click deploy template
```

Monorepo managed with **pnpm workspaces**. Runtime is **bun**.

## How It Works

### Core Flow

There are two event sources: **agent adapters** and **git hooks**.

Agent adapters call into the CLI when conversations start and end. Git hooks call into the CLI when commits and pushes happen. The CLI maintains local state that connects the two.

```
Agent Adapter                   Git Hooks
    |                               |
    |-- session start --+           |
    |                   v           |
    |              LOCAL STATE      |
    |              (pending queue)  |
    |-- session end ----+           |
    |                               |-- post-commit -> capture
    |                               |   (tag pending sessions with SHA)
    |                               |
    |                               |-- pre-push -> sync
    |                               |   (upload to worker, clear local state)
```

### Session Lifecycle

1. Agent adapter triggers a session start -> CLI generates a session ID, adds entry to pending queue
2. User has a conversation with the AI agent
3. Agent adapter triggers a session end -> CLI marks session as ended in the pending queue
4. User commits -> post-commit hook runs `residue capture` -> pending sessions get tagged with the commit SHA
5. User pushes -> pre-push hook runs `residue sync` -> CLI uploads session data directly to R2 via presigned URL, then POSTs metadata to worker API

### Upload Flow

Session data is uploaded **directly to R2** via presigned PUT URLs, bypassing the worker's request body size limits entirely. The worker only receives lightweight metadata.

```
CLI
  -> POST /api/sessions/upload-url (request presigned PUT URLs)
  <- Worker generates two presigned R2 PUT URLs using AWS SigV4:
       one for sessions/<id>.json (raw data)
       one for search/<id>.txt (lightweight search text)
  -> PUT <presigned-url> (upload raw session data directly to R2)
  -> PUT <search-presigned-url> (upload search text directly to R2)
  -> POST /api/sessions (metadata only, no session data)
    -> Worker upserts D1 metadata (does not touch R2)
```

The presigned URL generation uses lightweight AWS SigV4 signing with the Web Crypto API -- no AWS SDK dependency. It requires R2 S3 API credentials configured on the worker: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`.

### Key Design Decisions

**A conversation can span multiple commits.** If a session is still open when a commit happens, it gets linked to that commit. When the next commit happens, the same session gets linked again. The full session data is stored once; multiple commits reference it.

**Capture tagging is selective.** Open sessions always get tagged. Ended sessions with zero commits get tagged once. Ended sessions that already have commits are skipped to avoid incorrectly linking unrelated work.

**On push, open sessions upload their current state.** If a session is still open at push time, the current conversation state is uploaded to R2. On the next push, it gets overwritten with the latest state. The R2 key stays the same.

**Stale session detection.** During sync, open sessions whose data file has not been modified in 30 minutes are automatically marked as ended. This handles agent processes that crashed or closed without calling session-end.

**Org and repo are inferred from the git remote.** `git@github.com:my-team/my-app.git` -> org is `my-team`, repo is `my-app`. No manual configuration needed.

**No data normalization at rest.** Raw agent session data is stored as-is in R2. The worker's mappers transform it into a common format at render time. Adding a new agent means writing a mapper, not changing the storage schema.

**Search uses lightweight text files.** Raw session files are too large and noisy for embedding models. At sync time, the CLI generates a second, lightweight `.txt` file per session under `search/<id>.txt` in R2. These contain only human messages, assistant text, and tool name summaries -- no thinking blocks, tool output, token metadata, or signatures. Cloudflare AI Search indexes only the `search/` prefix.

**Users deploy their own worker.** No multi-tenant backend. Each user/team deploys their own Cloudflare Worker via a one-click deploy button. This eliminates auth complexity, data privacy concerns, and hosting costs for us.

## CLI (`packages/cli`)

### Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Published as:** `@residue/cli` on npm (via `bun publish`)

### Commands

**User-facing:**

| Command                       | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `residue login`               | Save worker URL + auth token to global config                    |
| `residue init`                | Install git hooks (post-commit, pre-push) in current repo        |
| `residue setup <agent>`       | Configure an agent adapter for this project (claude-code, pi)    |
| `residue push`                | Manual trigger to upload pending sessions (alias for sync)       |

**Hook-invoked (git):**

| Command           | Description                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `residue capture` | Called by post-commit hook. Tags pending sessions with the current commit SHA and branch     |
| `residue sync`    | Called by pre-push hook. Accepts `--remote-url` to derive org/repo. Uploads session data directly to R2 via presigned URL, then POSTs metadata to worker API, clears ended sessions from local state |

**Hook-invoked (agent adapters):**

| Command                    | Description                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `residue session start`    | Called by agent adapter when a conversation begins. Generates and returns a session ID to stdout. Flags: `--agent <name>` `--data <path-to-raw-session-file>` `--agent-version <semver>` |
| `residue session end`      | Called by agent adapter when a conversation ends. Marks the session as ended. Flags: `--id <session-id>`                                |
| `residue hook claude-code` | Specialized handler for Claude Code hooks. Reads JSON from stdin (Claude Code hook protocol). Handles both SessionStart and SessionEnd internally |

### Agent Adapters

Adapters are **not a separate package**. They live inside the CLI or are installed into projects by `residue setup`.

**Claude Code:** Uses Claude Code's native hook system. `residue setup claude-code` writes hook entries into `.claude/settings.json` that pipe session lifecycle events (as JSON on stdin) to `residue hook claude-code`. The hook command internally manages session start/end and maps Claude's `session_id` to residue's session ID via state files in `.residue/hooks/`.

**Pi:** Uses pi's extension system. `residue setup pi` installs an extension file at `.pi/extensions/residue.ts`. The extension source is embedded into the CLI binary at build time from `packages/cli/adapters/pi/extension.ts.txt`. The extension calls `residue session start` and `residue session end` directly via `pi.exec()`.

Both adapters store hook state in `.residue/hooks/` within the project root.

### Search Text Extractors

The CLI generates lightweight text summaries of session data for search indexing. These live in `packages/cli/src/lib/search-text.ts`.

Each agent has a simple extractor function (not the full worker-side mapper) that parses the raw session file and produces `SearchLine[]` entries tagged by role. The extractor is looked up by agent name via `getExtractor()`.

**What is kept:** human messages, assistant text responses, tool names with short descriptors (file paths, commands).

**What is stripped:** thinking blocks, tool output (actual file contents, command output), token/cost metadata, UUIDs, parent chains, signatures, cache metadata, sidechain entries, meta entries.

The `buildSearchText()` function combines a metadata header with the extracted lines into the final `.txt` format:

```
Session: <id>
Agent: claude-code
Commits: abc1234, def5678
Branch: feature-auth
Repo: my-team/my-app

[human] how do we fix the auth redirect
[assistant] I'll update the middleware to check the session token...
[tool] edit packages/worker/src/middleware/auth.ts
[tool] bash git diff --staged
[human] looks good, commit it
[assistant] Committed as abc123.
```

Supported agents: `claude-code`, `pi`. Adding a new agent means writing one extractor function and registering it in the `extractors` map.

### Local State

**Global config:** `~/.residue/config`

```json
{
  "worker_url": "https://my-residue.workers.dev",
  "token": "secret-token-from-deploy"
}
```

**Repo-level state:** `.residue/` (gitignored by `residue init`)

Pending queue: `.residue/pending.json`

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
    "agent": "pi",
    "agent_version": "0.5.0",
    "status": "open",
    "data_path": "/path/to/raw/session/log",
    "commits": [{"sha": "abc123", "branch": "feature-auth"}]
  }
]
```

Hook state: `.residue/hooks/` (maps agent session IDs to residue session IDs)

**`residue capture` behavior:**

- Reads pending.json
- Gets the current commit SHA and branch name
- Open sessions: always tagged
- Ended sessions with zero commits: tagged once
- Ended sessions that already have commits: skipped
- Writes updated pending.json

**`residue sync` behavior:**

- Reads pending.json
- Auto-closes stale open sessions (data file unmodified for 30+ minutes)
- Derives org + repo from `--remote-url` if provided (passed by pre-push hook), otherwise falls back to `git remote get-url origin`
- For each session with commits:
  - Reads raw session data directly from `data_path` (no local copies)
  - Reads commit metadata (message, author, timestamp) from git log for each associated SHA
  - Requests presigned PUT URLs from `POST /api/sessions/upload-url` (returns URLs for both raw data and search text)
  - Uploads raw session data directly to R2 via the presigned URL
  - Generates a lightweight search text file using the agent-specific text extractor (`packages/cli/src/lib/search-text.ts`), then uploads it to R2 at `search/<id>.txt` via the second presigned URL. Search upload failure is non-fatal.
  - POSTs metadata only to `POST /api/sessions` (no inline session data)
  - If session is `ended`: removes from pending.json
  - If session is `open`: keeps in pending.json (will re-upload with updated data on next push)
- Sessions with zero commits are kept as-is (nothing to upload yet)

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
residue sync --remote-url "$2"
```

The `$2` argument is the remote URL passed by git to the pre-push hook. This ensures org/repo are derived from the actual remote being pushed to, not hardcoded to `origin`. For manual `residue push`, it falls back to `origin`.

## Worker (`packages/worker`)

### Tech Stack

- **Framework:** Hono
- **Rendering:** JSX (server-rendered HTML)
- **Testing:** Vitest with @cloudflare/vitest-pool-workers
- **Styling:** Tailwind CSS
- **Icons:** Phosphor Icons
- **Storage:** Cloudflare R2 (raw session blobs) + D1 (query index)
- **Deployment:** One-click "Deploy to Cloudflare" button

The worker serves both the API (JSON) and the UI (HTML) from separate route groups.

### Auth

**API routes** (`/api/*`): Bearer token auth. A single secret `AUTH_TOKEN` set at deploy time. The CLI sends it as `Authorization: Bearer <token>`.

**UI routes** (`/app/*`): HTTP basic auth. `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars set at deploy time.

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
  branch TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE UNIQUE INDEX idx_commits_unique ON commits(commit_sha, session_id);
CREATE INDEX idx_commits_repo ON commits(org, repo);
CREATE INDEX idx_commits_sha ON commits(commit_sha);
CREATE INDEX idx_commits_session ON commits(session_id);
CREATE INDEX idx_commits_branch ON commits(org, repo, branch);
```

A session is stored once. Multiple commits can reference the same session. Org and repo live on the commits table since they come from the git remote.

### R2 Storage

Two prefixes are used:

- `sessions/<session-id>.json` -- raw, unmodified agent session data
- `search/<session-id>.txt` -- lightweight text summary for search indexing

The CLI uploads both files directly to R2 via presigned PUT URLs (bypassing the worker). For open sessions that span multiple pushes, both keys stay the same and the blobs are overwritten with the latest state.

The `search/` prefix contains plain text files optimized for embedding. They include a metadata header (session ID, agent, commits, branch, repo) followed by conversation lines tagged by role (`[human]`, `[assistant]`, `[tool]`). Thinking blocks, tool output, token metadata, and other noise are stripped. Cloudflare AI Search is configured to index only the `search/` prefix.

### API Routes

```
POST   /api/sessions/upload-url     -> Generate presigned R2 PUT URLs for direct upload (raw + search)
POST   /api/sessions                -> Receive session metadata + commit mappings, write to D1
GET    /api/sessions/:id            -> Fetch session metadata + raw data from R2
GET    /api/repos/:org/:repo        -> List commits with sessions (from D1, paginated via ?cursor=)
GET    /api/repos/:org/:repo/:sha   -> Get sessions for a specific commit
GET    /api/search?q=...            -> Search sessions via Cloudflare AI Search
GET    /api/search/ai?q=...         -> AI-powered search with generated answer via Cloudflare AI Search
```

**POST /api/sessions/upload-url** request body:

```json
{
  "session_id": "session-uuid-1"
}
```

Returns two presigned PUT URLs -- one for the raw session data, one for the search text:

```json
{
  "url": "<presigned PUT URL for sessions/session-uuid-1.json>",
  "r2_key": "sessions/session-uuid-1.json",
  "search_url": "<presigned PUT URL for search/session-uuid-1.txt>",
  "search_r2_key": "search/session-uuid-1.txt"
}
```

The CLI PUTs raw session data to `url` and the lightweight search text to `search_url`.

**POST /api/sessions** request body (metadata only, session data already in R2):

```json
{
  "session": {
    "id": "session-uuid-1",
    "agent": "claude-code",
    "agent_version": "1.2.3",
    "status": "ended"
  },
  "commits": [
    {
      "sha": "abc123",
      "org": "my-team",
      "repo": "my-app",
      "message": "fix auth redirect",
      "author": "jane",
      "committed_at": 1700000000,
      "branch": "feature-auth"
    }
  ]
}
```

Worker behavior on POST /api/sessions:

1. Upsert session row in D1 (update `ended_at` if status is ended)
2. Insert commit rows in D1 (skip duplicates via `ON CONFLICT DO NOTHING`)
3. Does NOT write to R2 -- session data is already there via presigned URL

### Conversation Rendering

There is **one generic UI component** that renders all conversations. It takes a common `Message[]` format and renders:

- Chat messages with role labels
- Code blocks with syntax highlighting
- Tool calls as collapsible blocks (tool name as header, input/output inside)
- Markdown rendering in message content
- "Continues from / continues in" links for sessions spanning multiple commits

Each agent gets a **mapper** -- a pure function that transforms the agent's raw session data into the common format. The mapper is the only agent-specific code. Everything else is shared.

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
  model?: string;
  tool_calls?: ToolCall[];
};

type Mapper = (raw: string) => Message[];
```

Mappers live in the worker:

```
worker/src/mappers/
  claude-code.ts
  pi.ts
  index.ts          -> registry, getMapper(agent) lookup
```

The worker reads `agent` from D1, picks the right mapper via `getMapper()`, transforms the raw R2 blob, and passes `Message[]` to the JSX template. Adding a new agent means writing one mapper function and registering it.

### Search

Search is powered by **Cloudflare AI Search** (formerly AutoRAG), pointed at the R2 bucket's `search/` prefix. It auto-indexes the lightweight text files, handles chunking/embedding/vector search.

The worker exposes two search endpoints:

- `GET /api/search?q=...` -- vector search, returns ranked results with scores and source chunks
- `GET /api/search/ai?q=...` -- AI-powered search, returns a generated answer plus source citations

The AI binding is configured in `wrangler.jsonc` under `"ai": {"binding": "AI"}`. The AI Search instance is named `residue-search`.

### UI Routes (Hono + JSX)

All UI routes are under `/app` and protected by basic auth:

```
GET    /app                         -> List orgs (grouped from commits table)
GET    /app/:org                    -> List repos in org
GET    /app/:org/:repo              -> Commit log with linked sessions
GET    /app/:org/:repo/:sha         -> Expanded view: commit + conversation(s)
```

`GET /` redirects to `/app`.

The UI is server-rendered HTML via Hono's JSX support. No client-side framework.

### Styling

**Fonts:** Monospace-first. `JetBrains Mono` or `IBM Plex Mono` for all UI text. System monospace as fallback.

**Color palette (dark mode -- default):**

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

**Spacing:** Tight. `gap-2` between messages, `gap-4` between commits. Dense information display -- this is a dev tool, not a marketing site.

**Code blocks:** Syntax highlighted with a minimal theme. Background slightly darker than surface. Rounded corners, small padding.

**Tool calls:** Collapsed by default. Phosphor `CaretRight` icon to expand. When expanded, show tool name, input, and output in a subdued style -- they're context, not the main content.

**Commit entries:** Subtle left border or dot indicator. SHA in monospace accent color. Message in primary text. Author and timestamp in secondary text. Agent badges as small pills.

**Session continuation:** Thin connecting line between commits that share a session. "continues from/in" links in secondary text with Phosphor `ArrowUp`/`ArrowDown` icons.

**Responsive:** Single column. Works on mobile but optimized for desktop. No sidebar on mobile.

### Deployment Template

The worker repo includes a "Deploy to Cloudflare" button that:

1. Forks/clones the worker package
2. Creates a D1 database and runs the migration
3. Creates an R2 bucket and generates S3 API credentials for it
4. Generates a secret auth token and sets it as an env var
5. Sets R2 S3 API credentials as env vars (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`)
6. Deploys the worker

The user gets back a worker URL and a token. That's all they need to run `residue login`.

## Build & Development

```bash
# Install dependencies
pnpm install

# Dev
pnpm --filter @residue/cli dev
pnpm --filter @residue/worker dev    # wrangler dev

# Build
pnpm --filter @residue/cli build

# Test
pnpm --filter @residue/worker test

# Deploy worker
pnpm --filter @residue/worker deploy

# Apply D1 migrations locally (required before running worker tests)
cd packages/worker && pnpm exec wrangler d1 migrations apply DB --local
```

### Tmux / Tmuxinator

A `.tmuxinator.yml` config lives at the project root. It starts the wrangler dev server.

```bash
# Start the dev session (from project root)
tmuxinator local

# Read the tmux pane output programmatically
tmux capture-pane -t residue -p
```

The tmux session is named `residue`. Use `tmux capture-pane -t residue -p` to read the worker's stdout/stderr without switching terminals.

## Coding Conventions

- **No emojis.** Never use emojis anywhere -- code, comments, logs, commit messages. Hard requirement.
- **`type` over `interface`.** Always prefer `type` for object shapes. Never use `interface`.
- **Boolean naming.** Boolean variables and properties must be prefixed with `is` or `has`.
- **Single object params.** Functions with 2+ parameters must use a single object parameter. Single-primitive-param functions are fine as-is.
- **No `any`.** Never use `any` in TypeScript. If absolutely unavoidable, add an inline comment explaining why.
- **Path aliases.** Use `@/*` path alias (mapped to `src/*`) for all imports. Never use relative `../` paths.

```ts
// Good
type Session = { id: string; isOpen: boolean; hasCommits: boolean };
function writePending(opts: { path: string; sessions: PendingSession[] })

// Bad
interface Session { id: string; open: boolean; commits: boolean };
function writePending(path: string, sessions: PendingSession[])
```

## Versioning

All packages share the same version. When bumping, update `version` in every `package.json` (root, cli, worker, docs) to the same value.

## Common Workflows

### Adding a CLI command

1. Create `packages/cli/src/commands/<name>.ts` exporting a function that returns `ResultAsync<void, CliError>`.
2. Register it in `packages/cli/src/index.ts`: import, add `program.command(...)` with `.action(wrapCommand(...))`.
3. Use `safeTry` + `yield*` for sequencing multiple `ResultAsync` calls.
4. Use `createLogger("<name>")` for output. All user-facing output goes through `log.info()` to stderr.
5. Reuse existing libs (`@/lib/config`, `@/lib/git`, `@/lib/pending`) rather than reimplementing.
6. Do not add tests for trivial commands.
7. Smoke-test by running `bun packages/cli/src/index.ts <name>` from the project root.

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
