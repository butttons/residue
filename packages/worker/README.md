# residue worker

Cloudflare Worker that serves as the backend for residue. Stores AI session data in R2, indexes commits in D1, and serves a browsable UI.

## Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono + JSX (server-rendered)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (session blobs, uploaded directly via presigned URLs)
- **Styling:** Tailwind CSS (CDN), JetBrains Mono, Phosphor Icons

## Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI: `npm i -g wrangler`
- Cloudflare account: `wrangler login`
- **R2 bucket with S3 API credentials** (see below)

### Step 1: Create an R2 bucket and S3 API token

The CLI uploads session data directly to R2 via presigned PUT URLs. This bypasses the worker entirely for large payloads. You need to create the bucket and an S3 API token before deploying.

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage** in the sidebar
3. Click **Create bucket** and name it (e.g. `residue`)
4. Go to **R2 Object Storage > API Tokens** (the R2-specific tokens page, not the main Cloudflare API tokens)
5. Click **Create API Token**
6. Set permissions to **Object Read & Write**, scoped to the bucket you created
7. Note the following values:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (visible in your Cloudflare dashboard URL or the R2 overview)
   - **Bucket name**

### Step 2: Deploy

**Option A: Automated**

```bash
bash setup.sh
```

The script creates a D1 database, runs migrations, generates an auth token, and deploys. After it finishes, set the R2 credentials:

```bash
# Set the secret access key (not safe to put in wrangler.jsonc)
wrangler secret put R2_SECRET_ACCESS_KEY
```

Update `wrangler.jsonc` with the non-secret R2 values:

```jsonc
{
  "vars": {
    "R2_ACCESS_KEY_ID": "<your access key id>",
    "R2_ACCOUNT_ID": "<your account id>",
    "R2_BUCKET_NAME": "<your bucket name>"
  }
}
```

Redeploy:

```bash
wrangler deploy
```

**Option B: Manual**

```bash
# Create D1 database
wrangler d1 create residue-db
# Copy the database_id into wrangler.jsonc

# Run migrations
wrangler d1 execute residue-db --remote --file=migrations/0001_init.sql

# Set secrets
echo "your-secret-token" | wrangler secret put AUTH_TOKEN
wrangler secret put ADMIN_PASSWORD
wrangler secret put R2_SECRET_ACCESS_KEY
```

Update `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "ADMIN_USERNAME": "admin",
    "R2_ACCESS_KEY_ID": "<from step 1>",
    "R2_ACCOUNT_ID": "<from step 1>",
    "R2_BUCKET_NAME": "<from step 1>"
  },
  "d1_databases": [
    {
      "database_id": "<your D1 database ID>"
    }
  ],
  "r2_buckets": [
    {
      "bucket_name": "<your bucket name>"
    }
  ]
}
```

Deploy:

```bash
wrangler deploy
```

### Step 3: Configure the CLI

```bash
residue login --url https://your-worker.workers.dev --token <token>
```

## Configuration Reference

### wrangler.jsonc vars

| Var | Description | Where it comes from |
|-----|-------------|---------------------|
| `ADMIN_USERNAME` | Username for Basic Auth on the `/app` UI | You choose it |
| `R2_ACCESS_KEY_ID` | R2 S3 API access key | Cloudflare R2 API Tokens page |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare dashboard |
| `R2_BUCKET_NAME` | Name of the R2 bucket | You chose it when creating the bucket |

### Secrets (set via `wrangler secret put`)

| Secret | Description |
|--------|-------------|
| `AUTH_TOKEN` | Bearer token for CLI-to-worker API auth |
| `ADMIN_PASSWORD` | Password for Basic Auth on the `/app` UI |
| `R2_SECRET_ACCESS_KEY` | R2 S3 API secret key (from the R2 API Tokens page) |

## Local Development

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
R2_SECRET_ACCESS_KEY=your-r2-secret-key
```

The `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, and `R2_BUCKET_NAME` vars are read from `wrangler.jsonc` during local dev. Only the secret access key needs to go in `.dev.vars`.

## API

All API routes require `Authorization: Bearer <token>` header.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/sessions/upload-url` | Generate a presigned R2 PUT URL for direct upload |
| `POST` | `/api/sessions` | Upload session metadata + commit mappings (no session data) |
| `GET` | `/api/sessions/:id` | Fetch session metadata + raw data from R2 |
| `GET` | `/api/repos/:org/:repo` | List commits with sessions (paginated via `?cursor=`) |
| `GET` | `/api/repos/:org/:repo/:sha` | Get sessions for a specific commit |

### POST /api/sessions/upload-url

Request a presigned PUT URL for uploading session data directly to R2.

```json
{
  "session_id": "session-uuid-1"
}
```

Response:

```json
{
  "url": "<presigned PUT URL>",
  "r2_key": "sessions/session-uuid-1.json"
}
```

The CLI PUTs the raw session data to the returned URL. The worker never sees the session payload.

### POST /api/sessions

Upload session metadata and commit mappings. Session data must already be in R2 (via the presigned URL above).

```json
{
  "session": {
    "id": "session-uuid",
    "agent": "claude-code",
    "agent_version": "2.1.42",
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
      "branch": "main"
    }
  ]
}
```

## UI

The UI is protected by HTTP Basic Auth (`ADMIN_USERNAME` + `ADMIN_PASSWORD`). Served under `/app`:

| Route | Page |
|-------|------|
| `/app` | Home -- list of orgs |
| `/app/:org` | Org -- list of repos |
| `/app/:org/:repo` | Repo -- commit timeline with linked sessions |
| `/app/:org/:repo/:sha` | Commit -- permalink with full conversation |

The root `/` redirects to `/app`.

## Mappers

Each agent's raw session data gets transformed into a common `Message[]` format for rendering. Mappers live in `src/mappers/`:

| Agent | File |
|-------|------|
| `claude-code` | `claude-code.ts` |
| `pi` | `pi.ts` |

Adding a new agent means writing one mapper function and registering it in `index.ts`. No storage schema changes needed.
