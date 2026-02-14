# residue worker

Cloudflare Worker that serves as the backend for residue. Stores AI session data in R2, indexes commits in D1, and serves a browsable UI.

## Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono + JSX (server-rendered)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (session blobs)
- **Styling:** Tailwind CSS (CDN), JetBrains Mono, Phosphor Icons

## Quick deploy

### Prerequisites

- Node.js 18+
- Wrangler CLI: `npm i -g wrangler`
- Cloudflare account: `wrangler login`

### Setup

```bash
cd packages/worker
bash setup.sh
```

The script will:
1. Create a D1 database and run migrations
2. Create an R2 bucket
3. Generate a random auth token and set it as a secret
4. Deploy the worker

You'll get back a worker URL and auth token. Use them to configure the CLI:

```bash
residue login --url https://worker.your-subdomain.workers.dev --token <token>
```

### Manual setup

If you prefer to set things up manually:

```bash
# Create D1 database
wrangler d1 create residue-db
# Copy the database_id into wrangler.jsonc

# Run migrations
wrangler d1 execute residue-db --remote --file=migrations/0001_init.sql

# Create R2 bucket
wrangler r2 bucket create residue-sessions

# Set auth token
echo "your-secret-token" | wrangler secret put AUTH_TOKEN

# Set Basic Auth credentials for the UI
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD

# Deploy
wrangler deploy
```

## Local development

```bash
# Install dependencies
pnpm install

# Apply D1 migrations locally (required before running tests)
pnpm exec wrangler d1 migrations apply DB --local

# Start dev server
pnpm dev
# -> http://localhost:8787

# Run tests
pnpm test
```

Create a `.dev.vars` file for local development:

```
AUTH_TOKEN=your-local-dev-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

## API

All API routes require `Authorization: Bearer <token>` header.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/sessions` | Upload session data + commit mappings |
| `GET` | `/api/sessions/:id` | Fetch raw session data from R2 |
| `GET` | `/api/repos/:org/:repo` | List commits with sessions (paginated via `?cursor=`) |
| `GET` | `/api/repos/:org/:repo/:sha` | Get sessions for a specific commit |

### POST /api/sessions

```json
{
  "session": {
    "id": "session-uuid",
    "agent": "claude-code",
    "agent_version": "2.1.42",
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
    }
  ]
}
```

## UI

The UI is protected by HTTP Basic Auth using `ADMIN_USERNAME` and `ADMIN_PASSWORD` secrets. It is served under `/app` with 4 pages:

| Route | Page |
|-------|------|
| `/app` | Home -- list of orgs |
| `/app/:org` | Org -- list of repos |
| `/app/:org/:repo` | Repo -- commit timeline with linked sessions |
| `/app/:org/:repo/:sha` | Commit -- permalink with full conversation |

The root `/` redirects to `/app`.

## Mappers

Each agent's raw session data gets transformed into a common `Message[]` format for rendering. Mappers live in `src/mappers/`:

| Agent | File | Format |
|-------|------|--------|
| `claude-code` | `claude-code.ts` | JSONL with tree-structured entries |
| `pi` | `pi.ts` | JSONL with tree-structured entries |

Adding a new agent means writing one mapper function -- no storage schema changes needed.

## Configuration

### wrangler.jsonc

- `d1_databases[0].database_id` -- your D1 database ID (set by `setup.sh`)
- `r2_buckets[0].bucket_name` -- R2 bucket name (default: `residue-sessions`)

### Secrets

- `AUTH_TOKEN` -- bearer token for API authentication (set via `wrangler secret put`)
- `ADMIN_USERNAME` -- username for Basic Auth on the `/app` UI (set via `wrangler secret put`)
- `ADMIN_PASSWORD` -- password for Basic Auth on the `/app` UI (set via `wrangler secret put`)
