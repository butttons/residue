# @residue/installer

Deployment installer for residue. Hosted at [install.residue.dev](https://install.residue.dev).

Automates the full setup: D1 database, R2 bucket, S3 API credentials, AI Search instance, secrets, and worker deployment. Also supports updating existing deployments at `/update`.

## How It Works

The user provides a Cloudflare API token. The installer calls the Cloudflare API to provision all required resources, bundles the pre-built worker code, and deploys it to the user's account.

## Development

```bash
pnpm run dev       # build + wrangler dev on port 8790
pnpm run deploy    # build + deploy (tags with git SHA)
```

## License

MIT
