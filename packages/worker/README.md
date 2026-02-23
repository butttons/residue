# @residue/worker

Cloudflare Worker that serves as the backend for residue. Stores session data in R2, indexes commits in D1, and serves a browsable web UI.

Part of [residue](https://residue.dev). See the [main README](../../README.md) for full setup and deployment instructions.

## Deploy

The easiest way is the installer at [install.residue.dev](https://install.residue.dev), which automates everything: D1 database, R2 bucket, S3 credentials, AI Search, secrets, and deployment.

For manual deployment or the Deploy to Cloudflare button, see the [main README](../../README.md#step-2-deploy-the-worker).

## Auth

- **API routes** (`/api/*`): Bearer token via `AUTH_TOKEN` secret.
- **UI routes** (`/app/*`): Cookie-based session auth. The `ADMIN_USERNAME` user is the super admin who can manage other users via `/app/settings`.
- Instances can be set to **public** (anyone can view) or **private** (login required) mode.

## Local Development

```bash
pnpm install

# Apply D1 migrations locally (required before tests)
pnpm exec wrangler d1 migrations apply DB --local

# Start dev server at http://localhost:8787
pnpm dev

# Run tests
pnpm test
```

Create a `.dev.vars` file for local secrets:

```
AUTH_TOKEN=your-local-dev-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
R2_SECRET_ACCESS_KEY=your-r2-secret-key
```

## Updating

Visit [install.residue.dev/update](https://install.residue.dev/update) to update an existing deployment to the latest version.

## License

MIT
